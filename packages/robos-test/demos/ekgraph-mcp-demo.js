'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The EKGraph MCP Server exposes the entire Engineering Knowledge Graph to AI agents via MCP.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Knowledge Graph Metrics',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos_ekgraph_search to retrieve service endpoints, topologies, and environments.',
    target: '#input-search',
    action: 'hover',
    callout: 'Perform Semantic Node Search',
    js: `(() => {
      const input = document.getElementById('input-search');
      input.value = 'auth';
      input.dispatchEvent(new Event('input'));
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We inspect detailed node metadata, endpoints, and team ownership via robos_ekgraph_get_node.',
    target: '#node-detail',
    action: 'hover',
    callout: 'Call robos_ekgraph_get_node',
    js: `(() => {
      const input = document.getElementById('input-search');
      input.value = '';
      input.dispatchEvent(new Event('input'));
      window.selectNode('services/auth-service');
    })()`,
    minHold: 3500,
  },
  {
    narration: 'We traverse linked architectural dependencies across production environments via robos_ekgraph_get_linked.',
    target: '#btn-traverse-linked',
    action: 'click',
    callout: 'Call robos_ekgraph_get_linked',
    minHold: 3200,
  },
  {
    narration: 'AI agents create and update knowledge nodes in real time using robos_ekgraph_create_node.',
    target: '#btn-create-node',
    action: 'click',
    callout: 'Call robos_ekgraph_create_node',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos://ekgraph/services to inspect live service catalogs and logging URIs.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Read robos://ekgraph/services Resource',
    minHold: 3000,
  },
];

runDemo({
  slug: 'ekgraph-mcp',
  appId: 'ekgraph-mcp',
  windowTitle: 'RobOS EKGraph MCP Server Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
