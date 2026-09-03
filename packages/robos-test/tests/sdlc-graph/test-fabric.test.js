'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { LocalTestFabric, DEFAULT_DB_FIXTURES } = require('../../lib/test-fabric');
const { MockStubGenerator } = require('../../lib/mock-stub-generator');

describe('Self-Contained Local Test & Dev Environment Fabric Tests with In-Depth Assertions', () => {
  it('spins up isolated test fabric in <3s, manages deterministic fixtures, and handles mock stubs', async () => {
    const fabric = new LocalTestFabric({ display: ':99' });

    // 1. Instant Spin-Up (<3000ms)
    const startRes = await fabric.start();
    assert.strictEqual(startRes.ok, true);
    assert.strictEqual(startRes.healthy, true);
    assert.ok(startRes.spinUpDurationMs < 3000, `Spin up latency (${startRes.spinUpDurationMs}ms) must be <3s`);

    // 2. Health & Telemetry Verification
    const health = fabric.getHealth();
    assert.strictEqual(health.status, 'UP');
    assert.strictEqual(health.display, ':99');
    assert.ok(health.mockStubsCount >= 4, 'Must have default mock stubs registered');

    // 3. Database Deterministic Fixtures
    const users = fabric.query('users');
    assert.strictEqual(users.length, 2, 'Must contain 2 seeded users');
    assert.strictEqual(users[0].username, 'standard-user');

    // 4. Snapshot & Rollback Verification
    fabric.createSnapshot('baseline');
    fabric.insert('submissions', { id: 'sub-test-1', formId: 'form-101', status: 'DRAFT' });
    assert.strictEqual(fabric.query('submissions').length, 1);

    fabric.restoreSnapshot('baseline');
    assert.strictEqual(fabric.query('submissions').length, 0, 'Must rollback submissions table');

    // 5. Mock API Stubs & Kafka Event Bus Simulation
    const getRes = fabric.dispatchRequest('GET', '/api/v1/forms/form-101');
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.title, 'Application Wizard');

    const submitRes = fabric.dispatchRequest('POST', '/api/v1/forms/form-101/submit', {
      applicant: 'standard-user',
    });
    assert.strictEqual(submitRes.status, 201);
    assert.strictEqual(submitRes.body.status, 'SUBMITTED');

    // Check Kafka Event Log
    const events = fabric.stubGenerator.getEvents('order-events');
    assert.strictEqual(events.length, 1, 'Must emit 1 Kafka order event');
    assert.strictEqual(events[0].payload.eventType, 'FormSubmittedEvent');

    // 6. Deterministic Reset
    await fabric.reset();
    assert.strictEqual(fabric.stubGenerator.getEvents().length, 0, 'Events must reset to 0');

    // 7. Teardown
    const stopRes = await fabric.stop();
    assert.strictEqual(stopRes.ok, true);
    assert.strictEqual(fabric.getHealth().status, 'DOWN');
  });
});
