'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { GitOpsSDLCParser } = require('../../../robos-lib/index');

describe('Declarative GitOps SDLC Schema Specification (.robos/) Tests with In-Depth Assertions', () => {
  it('validates compliant topology, teams, packages, and projects schema documents', () => {
    const parser = new GitOpsSDLCParser();

    const validTopology = {
      version: '1.0',
      kind: 'Topology',
      system: { id: 'buildbarn', name: 'BuildBarn' },
      nodes: [
        { id: 'forms-api', name: 'Forms API Service', type: 'service' },
        { id: 'db-main', name: 'Postgres DB', type: 'database' },
      ],
      links: [
        { from: 'forms-api', to: 'db-main', protocol: 'TCP/SQL' },
      ],
    };

    const validTeams = {
      version: '1.0',
      kind: 'TeamRoster',
      teams: [
        {
          id: 'core-platform',
          name: 'Core Platform Team',
          topology: 'platform',
          members: [
            { id: 'lead', name: 'Architect', type: 'human', role: 'Approver' },
            { id: 'agent-1', name: 'Gemini Planner', type: 'agent', role: 'Planner', model: 'gemini-2.5-pro' },
          ],
        },
      ],
    };

    const resTop = parser.validateTopology(validTopology);
    assert.strictEqual(resTop.valid, true, 'Topology should be valid');
    assert.strictEqual(resTop.errors.length, 0);

    const resTeams = parser.validateTeams(validTeams);
    assert.strictEqual(resTeams.valid, true, 'Teams should be valid');
    assert.strictEqual(resTeams.errors.length, 0);
  });

  it('detects missing required fields and emits actionable diagnostic errors', () => {
    const parser = new GitOpsSDLCParser();

    const brokenTopology = {
      version: '1.0',
      kind: 'Topology',
      // missing system
      nodes: [
        { id: 'broken-node' }, // missing name and type
      ],
      links: [],
    };

    const res = parser.validateTopology(brokenTopology);
    assert.strictEqual(res.valid, false, 'Broken topology should fail validation');
    assert.ok(res.errors.length >= 2, 'Should emit at least 2 diagnostic errors');
    assert.ok(res.errors.some(e => e.message.includes("Missing required root property 'system'")));
  });

  it('initializes .robos/ scaffold directory and loads valid SDLC specification tree', () => {
    const parser = new GitOpsSDLCParser();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-sdlc-spec-'));

    const initRes = parser.initSDLCDirectory(tmpDir);
    assert.strictEqual(initRes.ok, true);
    assert.ok(fs.existsSync(path.join(tmpDir, '.robos', 'topology.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.robos', 'teams.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.robos', 'packages.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.robos', 'projects.json')));

    const loadRes = parser.loadSDLC(path.join(tmpDir, '.robos'));
    assert.strictEqual(loadRes.valid, true, 'Scaffolded .robos/ should load cleanly');
    assert.strictEqual(loadRes.errors.length, 0);
    assert.strictEqual(loadRes.topology.system.id, 'buildbarn-platform');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
