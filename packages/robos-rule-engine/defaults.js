'use strict';

/**
 * Default rules shipped with RobOS.
 * These are written to ~/.config/robos/event-rules.json on first run
 * if the file does not exist.
 */
const DEFAULT_RULES = [
  {
    id: 'rule_default_ci_failure',
    name: 'CI failure notification',
    enabled: true,
    trigger: {
      eventType: 'ci_completed',
      conditions: [
        { field: 'payload.status', op: 'eq', value: 'failure' },
      ],
    },
    actions: [
      {
        type: 'notify',
        params: {
          tier: 'critical',
          category: 'ci_cd',
          title: 'CI Failed: {{payload.repo}}',
          message: 'Branch {{payload.branch}} — run #{{payload.runId}}',
        },
      },
    ],
    cooldown: 0,
    lastFired: null,
  },
  {
    id: 'rule_default_pr_review',
    name: 'PR review requested notification',
    enabled: true,
    trigger: {
      eventType: 'pr_review_requested',
      conditions: [],
    },
    actions: [
      {
        type: 'notify',
        params: {
          tier: 'warning',
          category: 'pr_review',
          title: 'Review requested: {{payload.title}}',
          message: 'PR #{{payload.prNumber}} in {{payload.repo}}',
        },
      },
    ],
    cooldown: 0,
    lastFired: null,
  },
  {
    id: 'rule_default_pr_merged',
    name: 'PR merged notification',
    enabled: true,
    trigger: {
      eventType: 'pr_merged',
      conditions: [],
    },
    actions: [
      {
        type: 'notify',
        params: {
          tier: 'info',
          category: 'pr_review',
          title: 'PR merged: {{payload.title}}',
          message: 'PR #{{payload.prNumber}} merged into {{payload.baseBranch}}',
        },
      },
    ],
    cooldown: 0,
    lastFired: null,
  },
  {
    id: 'rule_default_deploy',
    name: 'Deploy completed notification',
    enabled: true,
    trigger: {
      eventType: 'deploy',
      conditions: [],
    },
    actions: [
      {
        type: 'notify',
        params: {
          tier: 'info',
          category: 'ci_cd',
          title: 'Deployed: {{payload.service}}',
          message: '{{payload.env}} — version {{payload.version}}',
        },
      },
    ],
    cooldown: 0,
    lastFired: null,
  },
];

module.exports = { DEFAULT_RULES };
