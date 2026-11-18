'use strict';
// Managed services have independent lifetimes. Embedded listeners belong to their app.
const managed = [
  { id: 'gateway', name: 'RobOS Services Gateway', group: 'System', port: 19400, description: 'Authenticated routing to the enabled services on this host.' },
  { id: 'grocery-lists', name: 'Grocery Lists', group: 'Home', port: 19401, description: 'Shared persistent shopping lists and checked items.' },
  { id: 'home-services', name: 'Home Services', group: 'Home', port: 19402, description: 'Household devices, scenes and automation definitions. Device drivers are configured separately.' },
  { id: 'games', name: 'Game Library & Saves', group: 'Games', port: 19403, description: 'Persistent game library, saved games and play sessions.' },
  { id: 'elearning', name: 'eLearning Library & Progress', group: 'Learning', port: 19404, description: 'Course library and learner progress shared between clients.' },
];
const standalone = [
  { id: 'point-of-sale', name: 'Point of Sale API', group: 'Retail', source: 'packages/point-of-sale/serve.js', port: 3410 },
  { id: 'barista-order-api', name: 'Barista Order API', group: 'Retail', source: 'packages/barista-order-api/server.js', port: 3000 },
  { id: 'household', name: 'Household Sandbox', group: 'Home', source: 'packages/household/server.js', port: 4317, description: 'Synthetic statement sandbox; not a persistent household service.' },
  { id: 'kgraph-parse-portal', name: 'KGraph Parse Portal', group: 'Developer', source: 'packages/kgraph-parse-portal/server.js' },
  { id: 'robos-agentd', name: 'Agent Daemon', group: 'Developer', source: 'packages/robos-agentd/daemon.js' },
  { id: 'robos-profiled', name: 'Agent Profile Daemon', group: 'Developer', source: 'packages/robos-profiled/daemon.js' },
  { id: 'robos-event-bus', name: 'Event Bus', group: 'Developer', source: 'packages/robos-event-bus/event-bus.js' },
  { id: 'robos-mcp-router', name: 'MCP Router', group: 'Developer', source: 'packages/robos-mcp-router/router.js' },
];
module.exports = { managed, standalone };
