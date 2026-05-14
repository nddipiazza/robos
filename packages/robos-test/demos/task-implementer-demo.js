'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

/**
 * Task Implementer demo — Real Acme Inc Jira (KAN project).
 *
 * Shows:
 *   1. App connects to robos-acme.atlassian.net and loads real KAN tickets
 *   2. Developer selects a real KAN ticket
 *   3. AI agent starts (injected mock output for the recording)
 *   4. Agent completes with a summary
 *
 * Requires JIRA_TOKEN env var (set from `pass show robos-acme-inc/jira-token`).
 * Uses JIRA_USER env var or falls back to nicholas.dipiazza@gmail.com.
 */

// Mock agent output lines — streamed progressively for demo readability
const AGENT_LINES = [
  '🤖 Starting AI agent on KAN-67\n',
  '   Task: Migrate main app to consume @hermetiq/buildbarn-forms\n',
  '\n',
  '📋 Reading task description...\n',
  '   The main app still directly imports proto field renderers.\n',
  '   This ticket migrates it to use the new @hermetiq/buildbarn-forms package.\n',
  '\n',
  '🔍 Exploring codebase...\n',
  '   → src/app/App.tsx\n',
  '   → src/components/forms/\n',
  '   → package.json\n',
  '\n',
  '📝 Checking current imports...\n',
  '   Found 14 direct imports of internal renderers in App.tsx\n',
  '   New package exposes: ProtoFormBuilder, ScalarField, EnumField, NestedMessage\n',
  '\n',
  '✏️  Updating: package.json\n',
  '   + "@hermetiq/buildbarn-forms": "^1.0.0"\n',
  '\n',
  '✏️  Migrating: src/app/App.tsx\n',
  '   - import { ScalarField } from \'../components/forms/ScalarField\';\n',
  '   + import { ScalarField } from \'@hermetiq/buildbarn-forms\';\n',
  '   ... (12 more import lines updated)\n',
  '\n',
  '🧪 Running tests...\n',
  '   app.test.tsx ............. PASS (18 tests)\n',
  '   forms.test.tsx ........... PASS (31 tests)\n',
  '\n',
  '✅ Done! Summary:\n',
  '   Migrated main app to @hermetiq/buildbarn-forms.\n',
  '   Updated: package.json, src/app/App.tsx (14 imports)\n',
  '   All 49 tests pass. PR ready to open against main.\n',
];

// Build a JS snippet that streams agent lines with realistic delays
function buildAgentStreamJS() {
  return `
    (() => {
      const lines = ${JSON.stringify(AGENT_LINES)};
      let i = 0;
      window._demoSetAgentBusy(true);
      window._demoSetAgentStatus('AI agent running…', 'running');
      function next() {
        if (i >= lines.length) {
          window._demoSetAgentBusy(false);
          window._demoSetAgentStatus('Agent finished successfully.', 'done-ok');
          return;
        }
        window._demoAppendOutput(lines[i], false);
        i++;
        setTimeout(next, 80 + Math.random() * 60);
      }
      next();
      return 'streaming-started';
    })()
  `;
}

const SCRIPT = [
  {
    narration: 'RobOS Task Implementer connects directly to your ticket system and puts an AI agent to work on any issue — with a single click.',
    js: null,
    minHold: 5000,
  },
  {
    narration: 'This install is connected to Acme Inc Jira. The badge confirms a live connection to the KAN project.',
    js: null,
    minHold: 4000,
  },
  {
    narration: 'The left panel lists all open tickets from KAN — pulled straight from Jira right now.',
    js: null,
    minHold: 4500,
  },
  {
    narration: 'Let\'s pick up this migration ticket. Migrate the main app to consume the new buildbarn-forms package.',
    js: `window._demoSelectTask('KAN-67');`,
    minHold: 4500,
  },
  {
    narration: 'The workspace panel opens with the full ticket context loaded from Jira. You can add hints for the agent or just let it run.',
    js: null,
    minHold: 5500,
  },
  {
    narration: 'Hit Start Agent. RobOS fires up the AI, primed with the ticket context and ready to explore the codebase.',
    js: buildAgentStreamJS(),
    minHold: 5000,
  },
  {
    narration: 'The agent scans the repo, finds all the direct renderer imports, and migrates them to the new package — updating package dot json and App dot tsx.',
    js: null,
    minHold: 5000,
  },
  {
    narration: 'All 49 tests pass. The agent summarises its changes — a pull request is ready to open against main.',
    js: null,
    minHold: 4500,
  },
  {
    narration: 'Back in the task list, you can pick up the next ticket. Each one gets the same treatment: Jira context in, working code out.',
    js: `
      (() => {
        const items = document.querySelectorAll('.task-item');
        if (items[1]) items[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()
    `,
    minHold: 4000,
  },
  {
    narration: 'Task Implementer. Your entire backlog, turned into working code — powered by AI, grounded in your real Jira tickets.',
    js: null,
    minHold: 4000,
  },
];

runDemo({
  slug: 'task-implementer',
  appId: 'task-implementer',
  windowTitle: 'RobOS Task Implementer',
  scenario: scenarios['task-implementer-jira'],
  postSettle: 4000,
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
