'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'API Contract Studio integrates OpenAPI 3.1, AsyncAPI, and Pact consumer testing.',
    target: '#contract-item-forms_api_openapi_yaml',
    action: 'click',
    callout: 'Select Forms API Contract',
    minHold: 3500,
  },
  {
    narration: 'Developers and agents seamlessly toggle between production main and active feature branches.',
    target: '#select-gitops-branch',
    action: 'click',
    callout: 'Switch GitOps Branch',
    minHold: 3500,
  },
  {
    narration: 'Endpoints link directly to TypeSpec domain schemas with strict request validation.',
    target: '#endpoint-post--api-v1-forms',
    action: 'hover',
    callout: 'Inspect POST /api/v1/forms Operation',
    minHold: 3500,
  },
  {
    narration: 'Stoplight Spectral automatically enforces company-wide REST style rules.',
    target: '#btn-run-spectral',
    action: 'click',
    callout: 'Run Spectral Style Governance',
    minHold: 3500,
  },
  {
    narration: 'Pact consumer contract testing ensures changes never break downstream frontend clients.',
    target: '#btn-run-pact',
    action: 'click',
    callout: 'Run Pact Consumer Verification',
    minHold: 3500,
  },
  {
    narration: 'Instant Prism mock servers provide live HTTP endpoints conforming to response schemas.',
    target: '#btn-start-prism',
    action: 'click',
    callout: 'Start Prism Mock Server',
    minHold: 3500,
  },
];

runDemo({
  slug: 'contract-studio',
  appId: 'contract-studio',
  windowTitle: 'RobOS API Contract & Governance Engine',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
