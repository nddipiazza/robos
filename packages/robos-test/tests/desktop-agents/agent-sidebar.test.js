'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Pinned Agent Sidebar App (agent-sidebar) Tests with In-Depth Assertions', () => {
  it('launches agent-sidebar, verifies pinned context, steps timeline, live tool calls, and human approval flow', async () => {
    const app = await launchApp('agent-sidebar', {
      ...scenarios['all-good'],
      env: {
        ROBOS_TEST: '1',
        ROBOS_DEMO_SHOW: '1',
        ROBOS_TASK_ID: 'TASK-202',
        ROBOS_AGENT_ROLE: 'Lead Security Auditor',
      },
    });

    try {
      assert.ok(app.port, 'agent-sidebar debug port should be allocated');

      // 1. Assert Context and Header
      const roleText = await evalJS(app.port, `document.getElementById('agent-role').textContent`);
      assert.strictEqual(roleText, 'Lead Security Auditor');

      const taskText = await evalJS(app.port, `document.getElementById('task-badge').textContent`);
      assert.ok(taskText.includes('TASK-202'));

      // 2. Assert Step Progress
      const initialStep3Active = await evalJS(app.port, `document.getElementById('step-3').classList.contains('active')`);
      assert.strictEqual(initialStep3Active, true, 'Step 3 must be active initially');

      // 3. Assert Tool Invocation Stream
      const streamContent = await evalJS(app.port, `document.getElementById('tool-stream').textContent`);
      assert.ok(streamContent.includes('view_file'), 'Stream must contain view_file tool entry');
      assert.ok(streamContent.includes('run_command'), 'Stream must contain run_command tool entry');

      // 4. Trigger Human Approval
      await evalJS(app.port, `document.getElementById('btn-approve-step').click()`);
      await new Promise(r => setTimeout(r, 400));

      // 5. Assert Step Progression & Verified State
      const step3Completed = await evalJS(app.port, `document.getElementById('step-3').classList.contains('completed')`);
      assert.strictEqual(step3Completed, true, 'Step 3 must transition to completed');

      const step4Active = await evalJS(app.port, `document.getElementById('step-4').classList.contains('active')`);
      assert.strictEqual(step4Active, true, 'Step 4 must become active');

      const statusPill = await evalJS(app.port, `document.getElementById('agent-status-pill').textContent`);
      assert.strictEqual(statusPill, 'VERIFIED');

      const updatedStream = await evalJS(app.port, `document.getElementById('tool-stream').textContent`);
      assert.ok(updatedStream.includes('submit_verification'), 'Stream must log verification tool output');
    } finally {
      await killApp(app);
    }
  });
});
