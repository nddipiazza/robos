'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Entity Schema Studio standardizes domain modeling on Microsoft TypeSpec and Protobuf.',
    target: '#entity-item-form_typespec',
    action: 'click',
    callout: 'Select form.typespec Model',
    minHold: 3500,
  },
  {
    narration: 'The GitOps branch switcher allows toggling between production main and active feature branches.',
    target: '#select-gitops-branch',
    action: 'click',
    callout: 'Switch to feature/TAX-1099-ein-verification',
    minHold: 3500,
  },
  {
    narration: 'Canonical TypeSpec models define rich types, validation rules, and nested steps.',
    target: '#raw-schema-pre',
    action: 'hover',
    callout: 'Inspect TypeSpec DSL',
    minHold: 3500,
  },
  {
    narration: 'The cross-compiler generates native Java 21 Jackson record DTOs.',
    target: '#target-tab-java',
    action: 'click',
    callout: 'View Java 21 Records',
    minHold: 3500,
  },
  {
    narration: 'TypeScript interfaces and runtime Zod validation schemas are generated automatically.',
    target: '#target-tab-ts',
    action: 'click',
    callout: 'View TypeScript Zod Schemas',
    minHold: 3500,
  },
  {
    narration: '1-click compilation generates TypeScript, Java, Python, Go, and Prisma schemas.',
    target: '#btn-compile-targets',
    action: 'click',
    callout: 'Compile All Multi-Lang Targets',
    minHold: 3500,
  },
  {
    narration: 'Automated Buf Breaking audits ensure zero backward-incompatible schema drift.',
    target: '#btn-detect-breaking',
    action: 'click',
    callout: 'Detect Breaking Schema Changes',
    minHold: 3500,
  },
];

runDemo({
  slug: 'schema-studio',
  appId: 'schema-studio',
  windowTitle: 'RobOS Entity Schema Studio & Code Generator',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
