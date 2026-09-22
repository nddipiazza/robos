'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { XvfbRobOSAgentSession } = require('../lib/xvfb-agent-session');

test('XvfbRobOSAgentSession initializes and lists artifact directories', () => {
  const session = new XvfbRobOSAgentSession({
    display: ':99',
    webPort: 18090
  });

  assert.equal(session.display, ':99');
  assert.equal(session.webPort, 18090);

  const artifacts = session.listArtifacts();
  assert.ok(Array.isArray(artifacts.videos), 'Artifacts should include videos array');
  assert.ok(Array.isArray(artifacts.telemetry), 'Artifacts should include telemetry array');
  assert.ok(artifacts.videos.length >= 4, `Expected at least 4 scenario videos, found ${artifacts.videos.length}`);
  assert.ok(artifacts.telemetry.length >= 4, `Expected at least 4 telemetry JSONs, found ${artifacts.telemetry.length}`);
});
