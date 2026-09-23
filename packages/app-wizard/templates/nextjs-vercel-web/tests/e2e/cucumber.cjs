// Cucumber config. BASE_URL defaults to local dev server.
module.exports = {
  default: {
    paths: ['tests/e2e/features/**/*.feature'],
    import: ['tests/e2e/support/**/*.mjs'],
    format: ['progress-bar', 'json:evidence/cucumber-report.json', 'html:evidence/cucumber-report.html'],
    parallel: 0,
    retry: 0,
    tags: process.env.E2E_TAGS || 'not @wip',
  },
};
