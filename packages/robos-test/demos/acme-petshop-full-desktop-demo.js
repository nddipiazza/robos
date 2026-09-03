'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Acme Petshop: Polyglot Java Spring Boot backend, React web frontend, and reusable library.',
    target: '#btn-open-review-hub',
    action: 'click',
    callout: 'Open Dev Central & Acme Petshop Sprint',
    minHold: 4000,
  },
  {
    narration: 'TypeSpec domain models compile Java Jackson DTOs and TypeScript Zod schemas in <80ms.',
    target: '#chapter-btn-1',
    action: 'click',
    callout: 'Inspect Architectural Specs & pet.typespec',
    minHold: 4000,
  },
  {
    narration: 'Automated governance gates enforce 100% Pact (14/14 pass) and OpenAPI 3.1 Spectral linting.',
    target: '#chapter-btn-2',
    action: 'click',
    callout: 'Verify Contract Test Gates',
    minHold: 4000,
  },
  {
    narration: 'Autonomous agent swarms execute multi-repo worktrees and commit to local Gitea forge.',
    target: '#chapter-btn-3',
    action: 'click',
    callout: 'Inspect Proof-of-Work Video',
    minHold: 4000,
  },
  {
    narration: 'Lead Reviewer executes 1-click sign-off, merging PR #42 to main on the hermetic Gitea forge.',
    target: '#btn-signoff-merge',
    action: 'click',
    callout: '1-Click Lead Reviewer Sign-Off & Merge',
    minHold: 4500,
  },
];

runDemo({
  slug: 'acme-petshop',
  appId: 'dev-central',
  windowTitle: 'RobOS Dev Central',
  scenario: scenarios['all-good'],
  fullDesktop: true,
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
