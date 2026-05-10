'use strict';
const path     = require('path');
const fs       = require('fs');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

// ── Typing helper ─────────────────────────────────────────────────────────────
function JS_TYPE(selector, text, delayMs = 28) {
  return `
    (() => {
      (async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        el.focus();
        el.value = '';
        for (const ch of ${JSON.stringify(text)}) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, ${delayMs}));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })();
      return 'typing-started';
    })();
  `;
}

// ── Project prompt ────────────────────────────────────────────────────────────
// Describes the Buildbarn MVP Integration project so the AI can generate a full
// multi-epic breakdown with all stories.
const PROJECT_PROMPT = `Create a full epic and story breakdown for the Buildbarn MVP Integration project.

Project goal: Extract the ProtoFormBuilder component from buildbarn-config-editor into a standalone reusable TypeScript npm package called @hermetiq/buildbarn-forms, then integrate that package into the Hermetiq MVP dashboard.

Architecture:
- @hermetiq/buildbarn-forms (TypeScript React library) — extracted from buildbarn-config-editor
- MVP/BBConfigEditor.js (JavaScript integration layer) — consumes the library via gRPC
- cloud-native/bbconfig (Go gRPC backend — already built)
- GitHub/bb-config (storage — already set up)

Create 3 epics with all stories:

Epic 1 — Component Library Extraction (18h)
Stories: create npm package structure, copy ProtoFormBuilder core, add proto comment extraction for InfoTooltip, copy form field components, copy generated proto types, create public API, add build pipeline + tooling, write package README, test package build, add initial unit tests, version control and docs

Epic 2 — MVP Integration Foundation (16h)  
Stories: understand current BBConfigEditor, design integration architecture, create schema mapper for Buildbarn configs, create ConfigSetEditor component, integrate with gRPC backend, update BBConfigEditor navigation, style integration, error handling, basic E2E test

Epic 3 — Core Features (24h)
Stories: add worker config support, add browser config support, create config templates, version history display, basic diff viewer, improved validation, jsonnet generation improvements, ExtVars management UI, search and filter config sets, keyboard shortcuts

Each story should have a detailed description including acceptance criteria.`;

// ── Demo script ───────────────────────────────────────────────────────────────
const SCRIPT = [
  {
    narration: 'RobOS Task Planner turns a plain-English project description into a complete Jira backlog — epics, stories, and all — in a single AI-assisted step.',
    js: null, minHold: 5000,
  },
  {
    narration: 'It is already connected to our Acme Jira project. The server badge in the top right shows the active task server.',
    js: null, minHold: 4500,
  },
  {
    narration: 'We have a big new project: extracting the Buildbarn form builder into a reusable library and wiring it into the Hermetiq MVP dashboard. Instead of writing each epic and story by hand, let\'s describe the whole project to the AI.',
    js: null, minHold: 6500,
  },
  {
    narration: 'Type the project description into the AI prompt box. We include the goal, the architecture, and an outline of the three epics we want created.',
    js: JS_TYPE('#prompt-input', PROJECT_PROMPT, 2),
    minHold: 8000,
  },
  {
    narration: 'Hit Generate. The AI reads the full project brief and produces a structured JSON hierarchy — three epics with all their child stories — before a single API call touches Jira.',
    js: `document.getElementById('btn-generate').click();`,
    minHold: 120000, // AI generation can take up to 2 minutes
  },
  {
    narration: 'The task preview appears. Each epic is shown as a purple header row, with its stories nested underneath. We can see Epic 1 — Component Library Extraction — with all eleven stories ready to review.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Epic 2 covers the MVP Integration Foundation: schema mapper, ConfigSetEditor, gRPC wiring, navigation updates, and end-to-end tests.',
    js: `(() => {
      const epics = document.querySelectorAll('.task-item.is-epic');
      if (epics[1]) epics[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    })();`,
    minHold: 5000,
  },
  {
    narration: 'Epic 3 handles Core Features: all config types, templates, version history, diff viewer, validation, and search. Thirty-plus stories generated from a single prompt.',
    js: `(() => {
      const epics = document.querySelectorAll('.task-item.is-epic');
      if (epics[2]) epics[2].scrollIntoView({ behavior: 'smooth', block: 'center' });
    })();`,
    minHold: 5000,
  },
  {
    narration: 'Scroll back to the top to see the full list. Everything looks right. Click Create All Tasks to push every epic and story to Jira in one shot.',
    js: `window.scrollTo({ top: 0, behavior: 'smooth' });`,
    minHold: 2000,
  },
  {
    narration: 'RobOS creates all epics first, maps their Jira keys, then creates each child story linked to its parent epic. No manual linking required.',
    js: `document.getElementById('btn-create-all').click();`,
    minHold: 90000, // Creating 30+ issues takes time
  },
  {
    narration: 'Every issue was created successfully. Green check marks confirm each story landed in Jira under the right epic. Click any link to open the ticket directly in your browser.',
    js: null, minHold: 6000,
  },
  {
    narration: 'The entire Buildbarn MVP Integration backlog — three epics and all their stories — is now live in Jira, ready to assign and sprint-plan. RobOS Task Planner: from project idea to full backlog in under three minutes.',
    js: null, minHold: 6000,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────
const scenario = {
  ...scenarios['task-planner-jira-live'],
  passEntries: {
    'robos-acme-inc/jira-token': process.env.JIRA_TOKEN || scenarios['task-planner-jira-live'].passEntries['robos-acme-inc/jira-token'],
  },
};

runDemo({
  slug: 'task-planner',
  appId: 'task-planner',
  windowTitle: 'RobOS Task Planner',
  scenario,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
