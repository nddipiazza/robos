/**
 * RobOS Task Client — unified interface for task server adapters.
 *
 * Usage:
 *   const { createAdapter } = require('robos-task-client');
 *   const adapter = createAdapter(serverConfig);
 *   const issues = await adapter.searchIssues({ assignee: 'me' });
 */
'use strict';

const { JiraAdapter } = require('./jira-adapter');
const { GitHubAdapter } = require('./github-adapter');
const { WORK_ITEM_TYPES, validateParentChild, calculateProgress, buildHierarchy, detectWorkItemType, statusBucket } = require('./work-item');

function createAdapter(serverConfig) {
  switch (serverConfig.type) {
    case 'jira': return new JiraAdapter(serverConfig);
    case 'github': return new GitHubAdapter(serverConfig);
    default: throw new Error(`Unsupported task server type: ${serverConfig.type}`);
  }
}

module.exports = {
  createAdapter, JiraAdapter, GitHubAdapter,
  WORK_ITEM_TYPES, validateParentChild, calculateProgress, buildHierarchy, detectWorkItemType, statusBucket,
};
