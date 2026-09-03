'use strict';
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

async function main() {
  // 1. Run Demo for IDE Bridge MCP Console (Video 1)
  console.log('[Multi-Window] 1/2 Recording IDE Bridge MCP Console...');
  const consoleScript = [
    {
      narration: 'The IDE Bridge MCP Server connects AI agents directly to developer IDEs over HTTP IPC and CLI automation.',
      target: '#stat-bar',
      action: 'hover',
      callout: 'Inspect IDE Bridge Metrics',
      minHold: 3200,
    },
    {
      narration: 'AI agents query robos_ide_get_open_files to discover active tabs and cursor positions in real time.',
      target: '#files-list',
      action: 'hover',
      callout: 'Discover Open Editor Files',
      minHold: 3200,
    },
    {
      narration: 'We dispatch robos_ide_open_file to navigate IntelliJ to HelloWorld.java at Line 6.',
      target: '#btn-open-file',
      action: 'click',
      callout: 'Call robos_ide_open_file',
      minHold: 3500,
    },
    {
      narration: 'We set a reproduction breakpoint directly on Line 6 via robos_ide_set_breakpoint.',
      target: '#btn-set-bp',
      action: 'click',
      callout: 'Call robos_ide_set_breakpoint (Line 6)',
      minHold: 3500,
    },
    {
      narration: 'AI agents trigger Debug HelloWorld.main() using robos_ide_run_config over port 63343.',
      target: '#btn-run-debug',
      action: 'click',
      callout: 'Trigger Debug Run Configuration',
      minHold: 3500,
    },
    {
      narration: 'We inspect live JSON-RPC protocol messages and query robos://ide/status for connected IDE telemetry.',
      target: '#trace-log',
      action: 'hover',
      callout: 'Read robos://ide/status Resource',
      minHold: 3200,
    },
  ];

  await runDemo({
    slug: 'ide-bridge-mcp',
    appId: 'ide-bridge-mcp',
    windowTitle: 'RobOS IDE Bridge MCP Server Console',
    scenario: scenarios['all-good'],
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: consoleScript,
  });

  // 2. Run Demo for IntelliJ IDEA Window (Video 2)
  console.log('[Multi-Window] 2/2 Recording Live IntelliJ IDEA Window...');
  const ideScript = [
    {
      narration: 'IntelliJ IDEA Ultimate 2026.1 connects to RobOS over HTTP port 63343 IPC.',
      target: '.ij-titlebar',
      action: 'hover',
      callout: 'Connected to IPC Port 63343',
      minHold: 3200,
    },
    {
      narration: 'The active project robos-java-service opens src/main/java/com/robos/HelloWorld.java.',
      target: '#ij-tab-hello',
      action: 'hover',
      callout: 'Open HelloWorld.java Editor Tab',
      minHold: 3200,
    },
    {
      narration: 'The IDE Bridge MCP server automatically injects a breakpoint on Line 6: System.out.println(greeting).',
      target: '#gutter-line-6',
      action: 'hover',
      callout: 'Breakpoint Injected at Line 6',
      minHold: 3500,
    },
    {
      narration: 'The debug runner attaches to the JVM and suspends execution at the breakpoint on Thread: main.',
      target: '#code-line-6',
      action: 'hover',
      callout: 'Thread Suspended on Line 6',
      minHold: 3800,
    },
    {
      narration: 'In the Debugger pane, we inspect stack frames and local variable greeting = "Hello from RobOS & MCP!".',
      target: '#ij-debugger',
      action: 'hover',
      callout: 'Inspect Stack Frames & Local Variables',
      minHold: 3500,
    },
  ];

  await runDemo({
    slug: 'intellij-idea',
    appId: 'intellij-idea',
    windowTitle: 'IntelliJ IDEA Ultimate 2026.1 - robos-java-service',
    scenario: scenarios['all-good'],
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: ideScript,
  });

  console.log('[Multi-Window] Successfully generated both videos!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
