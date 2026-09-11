'use strict';

// Retired: the graph viewer no longer contains the demo-only object panels.
// Keep this entry point as an explicit notice for old commands and bookmarks.
console.error(
  'Retired demo: gitops-schema. Its canned graph-viewer panels have been removed.\n' +
  'No app was launched and no walkthrough was recorded.\n' +
  'Backend coverage: node --test packages/robos-test/tests/sdlc-graph/gitops-schema.test.js\n' +
  'See packages/robos-test/demos/RETIRED.md for supported verification.'
);
process.exitCode = 1;
