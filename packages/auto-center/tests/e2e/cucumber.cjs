// Auto Center lifecycle suite. `npm run e2e:lifecycle` writes the report, per-scenario videos and the
// screenshots used by the user guide. Set E2E_TAGS to run a subset.
module.exports = {
  default: {
    paths: process.env.E2E_FEATURES ? process.env.E2E_FEATURES.split(',') : ['tests/e2e/features/**/*.feature'],
    require: ['tests/e2e/support/**/*.js'],
    format: ['progress', 'json:evidence/cucumber-report.json', 'html:evidence/cucumber-report.html', 'message:evidence/cucumber-messages.ndjson'],
    parallel: 0,
    retry: 0,
    tags: process.env.E2E_TAGS || 'not @wip',
    worldParameters: {},
  },
};
