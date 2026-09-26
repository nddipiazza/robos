'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Normalizes input speech text by removing punctuation, collapsing whitespace, and lowercasing.
 */
function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * All 48 RobOS Skills definitions with voice command triggers and intents
 */
const SKILL_VOICE_DEFINITIONS = [
  {
    id: 'kgraph-validate',
    title: 'Validate Knowledge Graph',
    category: 'Knowledge Graph',
    description: 'Run W3C SHACL shape validation across all Knowledge Graph packages',
    matchers: ['validate knowledge graph', 'validate kgraph', 'validate shapes', 'check shapes', 'shacl validate'],
    action: 'kgraph-validate',
  },
  {
    id: 'kgraph-search',
    title: 'Search Knowledge Graph',
    category: 'Knowledge Graph',
    description: 'Semantic search across all Knowledge Graph packages for components or entities',
    matchers: ['search knowledge graph', 'search kgraph', 'lookup in graph', 'search graph'],
    action: 'kgraph-search',
    hasWildcard: true,
  },
  {
    id: 'kgraph-diff',
    title: 'KGraph Semantic Blast Diff',
    category: 'Knowledge Graph',
    description: 'Compare World 1 (main) against World 2 to detect breaking architectural changes',
    matchers: ['kgraph diff', 'semantic blast diff', 'graph diff', 'blast radius diff'],
    action: 'kgraph-diff',
  },
  {
    id: 'kgraph-impact-analysis',
    title: 'Component Blast Radius Analysis',
    category: 'Knowledge Graph',
    description: 'Trace transitive dependency ripple effects and blast radius for an entity',
    matchers: ['impact analysis', 'blast radius analysis', 'trace dependencies', 'kgraph impact'],
    action: 'kgraph-impact',
    hasWildcard: true,
  },
  {
    id: 'kgraph-visualize',
    title: 'Visualize KGraph Architecture',
    category: 'Knowledge Graph',
    description: 'Generate executable Mermaid diagram syntax or C4 component architecture',
    matchers: ['visualize graph', 'graph diagram', 'kgraph visualize', 'draw graph architecture'],
    action: 'kgraph-visualize',
    hasWildcard: true,
  },
  {
    id: 'kgraph-export',
    title: 'Export Graph to Turtle / RDF',
    category: 'Knowledge Graph',
    description: 'Export SDLC Knowledge Graph into standard W3C Turtle (.ttl) or JSON-LD',
    matchers: ['kgraph export', 'export knowledge graph', 'export graph to turtle', 'export rdf'],
    action: 'kgraph-export',
  },
  {
    id: 'kgraph-query',
    title: 'Query Entities or Graph Paths',
    category: 'Knowledge Graph',
    description: 'Query entities by RDF type or trace reference path between two nodes',
    matchers: ['kgraph query', 'query knowledge graph', 'query graph', 'trace graph path'],
    action: 'kgraph-query',
    hasWildcard: true,
  },
  {
    id: 'kgraph-insert',
    title: 'Insert Knowledge Graph Node',
    category: 'Knowledge Graph',
    description: 'Register a new architectural node with W3C SHACL shape validation gate',
    matchers: ['kgraph insert', 'insert graph node', 'register architecture node'],
    action: 'kgraph-insert',
  },
  {
    id: 'kgraph-update',
    title: 'Update Knowledge Graph Node',
    category: 'Knowledge Graph',
    description: 'Update properties, contracts, or dependencies on existing Knowledge Graph node',
    matchers: ['kgraph update', 'update graph node', 'modify graph entity'],
    action: 'kgraph-update',
  },
  {
    id: 'kgraph-delete',
    title: 'Delete Knowledge Graph Node',
    category: 'Knowledge Graph',
    description: 'Remove an entity node from Knowledge Graph with optional cascade reference pruning',
    matchers: ['kgraph delete', 'delete graph node', 'remove graph entity'],
    action: 'kgraph-delete',
  },
  {
    id: 'plan-before-implement',
    title: 'Plan Project Before Implementation',
    category: 'Task Management',
    description: 'Create a reviewed project plan with linked GitHub features and tasks in Task Planner',
    matchers: ['plan before implement', 'create project plan', 'plan project', 'plan feature'],
    action: 'plan-before-implement',
  },
  {
    id: 'view-task-plan',
    title: 'View Project Task Plan',
    category: 'Task Management',
    description: 'View or list active project tasks and saved plans by task number or project',
    matchers: ['view task plan', 'show task plan', 'list tasks', 'show tasks', 'view tasks', 'what are the tasks'],
    action: 'view-task-plan',
  },
  {
    id: 'update-project-plan',
    title: 'Update Project Plan',
    category: 'Task Management',
    description: 'Edit, refresh, or restore a saved RobOS project plan with reviewed proposal',
    matchers: ['update project plan', 'edit project plan', 'refresh plan'],
    action: 'update-project-plan',
  },
  {
    id: 'remove-project-plan',
    title: 'Remove Project Plan',
    category: 'Task Management',
    description: 'Remove saved RobOS project plan through reviewed proposal while retaining tracker issues',
    matchers: ['remove project plan', 'delete task plan', 'clear project plan'],
    action: 'remove-project-plan',
  },
  {
    id: 'add-task',
    title: 'Add Task to Project Plan',
    category: 'Task Management',
    description: 'Add a new task or work item to the active project plan',
    matchers: ['add a task', 'create a task', 'new task', 'add task'],
    action: 'add-task',
    hasWildcard: true,
  },
  {
    id: 'restart-taskbar',
    title: 'Restart Taskbar Dock',
    category: 'System',
    description: 'Restart or focus the RobOS desktop taskbar dock and desktop manager daemon',
    matchers: ['restart taskbar', 'restart dock', 'restart taskbar dock', 'reset taskbar', 'restart desktop manager'],
    action: 'restart-taskbar',
  },
  {
    id: 'read-error-logs',
    title: 'Read System Error Logs',
    category: 'System',
    description: 'Inspect recent system failure logs, unhandled exceptions, and Electron errors',
    matchers: ['read error logs', 'show error logs', 'check errors', 'view system logs', 'system errors', 'error log', 'show errors'],
    action: 'read-error-logs',
  },
  {
    id: 'git-changed-files',
    title: 'Check Git Status & Changes',
    category: 'Git',
    description: 'Query current git branch, dirty working tree status, and changed files',
    matchers: ['git status', 'what changed', 'show git status', 'working tree status', 'what branch', 'git repo'],
    action: 'git-status',
  },
  {
    id: 'git-recent-commits',
    title: 'Recent Git Commits',
    category: 'Git',
    description: 'Show recent commit log graph with branch history and author info',
    matchers: ['git commits', 'recent commits', 'git log', 'recent git history'],
    action: 'git-recent-commits',
  },
  {
    id: 'top-memory',
    title: 'Top Memory Processes',
    category: 'System',
    description: 'List top processes consuming memory on the workstation',
    matchers: ['top memory', 'memory usage', 'who is using memory', 'high memory processes'],
    action: 'top-memory',
  },
  {
    id: 'top-cpu',
    title: 'Top CPU Processes',
    category: 'System',
    description: 'List top processes consuming CPU cycles',
    matchers: ['top cpu', 'cpu usage', 'high cpu', 'cpu consumers'],
    action: 'top-cpu',
  },
  {
    id: 'free-memory',
    title: 'System Memory Overview',
    category: 'System',
    description: 'Inspect free and used RAM and virtual memory swap',
    matchers: ['free memory', 'available ram', 'system memory', 'show ram'],
    action: 'free-memory',
  },
  {
    id: 'disk-space',
    title: 'Disk Space Overview',
    category: 'System',
    description: 'Show disk space usage for all mounted filesystems',
    matchers: ['disk space', 'free disk', 'disk usage', 'how much disk'],
    action: 'disk-space',
  },
  {
    id: 'list-open-ports',
    title: 'List Open Ports',
    category: 'System',
    description: 'Show all listening TCP ports and associated process names',
    matchers: ['open ports', 'listening ports', 'list ports', 'show open ports'],
    action: 'list-open-ports',
  },
  {
    id: 'test-container',
    title: 'Run Tests in Container',
    category: 'Testing',
    description: 'Execute containerized headless E2E tests in Docker with virtual framebuffer',
    matchers: ['test container', 'run tests in docker', 'run container tests', 'run test container', 'run tests', 'run unit test'],
    action: 'test-container',
  },
  {
    id: 'e2e-driven-dev',
    title: 'Execute E2E Driven Development',
    category: 'Testing',
    description: 'Execute task development using an End-to-End Driven Development (EDD) workflow',
    matchers: ['e2e driven dev', 'run edd workflow', 'end to end dev'],
    action: 'e2e-driven-dev',
  },
  {
    id: 'create-test',
    title: 'Generate Test with robos-test',
    category: 'Testing',
    description: 'Generate robust E2E and unit tests for RobOS Electron apps using the robos-test framework',
    matchers: ['create test', 'generate test', 'write robos test'],
    action: 'create-test',
  },
  {
    id: 'record-demo',
    title: 'Record Demo Walkthrough Video',
    category: 'Documentation',
    description: 'Capture an automated, text-narrated walkthrough video of an app with WebVTT captions',
    matchers: ['record demo', 'record walkthrough video', 'capture demo', 'record video walkthrough'],
    action: 'record-demo',
  },
  {
    id: 'generate-app-docs',
    title: 'Generate Living Application Docs',
    category: 'Documentation',
    description: 'Synthesize living Markdown architecture documentation and Mermaid FlowDiagram',
    matchers: ['generate app docs', 'generate documentation', 'create app docs'],
    action: 'generate-app-docs',
  },
  {
    id: 'sync-kgraph-docs',
    title: 'Synchronize KGraph Living Docs',
    category: 'Documentation',
    description: 'Inspect KGraph updates, discern documentation impacts, and synchronize living docs',
    matchers: ['sync kgraph docs', 'sync documentation', 'update living docs'],
    action: 'sync-kgraph-docs',
  },
  {
    id: 'generate-app-elearning',
    title: 'Generate Interactive eLearning Course',
    category: 'Education',
    description: 'Synthesize interactive eLearning curriculum and scaffold standalone Electron app',
    matchers: ['generate elearning', 'create elearning course', 'scaffold elearning'],
    action: 'generate-app-elearning',
  },
  {
    id: 'pr-review-theater',
    title: 'PR Review Theater',
    category: 'Code Review',
    description: 'Inspect and orchestrate PR Review Theater with knowledge checks and semantic diffs',
    matchers: ['pr review theater', 'review theater', 'inspect pull request'],
    action: 'pr-review-theater',
  },
  {
    id: 'import-company-kgraph',
    title: 'Import Repositories into KGraph',
    category: 'Knowledge Graph',
    description: 'Extract evidence-backed SDLC graph from local Git checkouts into Knowledge Graph',
    matchers: ['import company kgraph', 'import repositories to graph', 'import company graph'],
    action: 'import-company-kgraph',
  },
  {
    id: 'schema-lookup',
    title: 'Schema & Vocabulary Lookup',
    category: 'Knowledge Graph',
    description: 'Query Schema.org, OASIS OSLC, and definitive semantic vocabularies',
    matchers: ['schema lookup', 'lookup schema', 'query ontology', 'schema registry lookup'],
    action: 'schema-lookup',
  },
  {
    id: 'create-feature-spec',
    title: 'Create Feature Specification',
    category: 'Architecture',
    description: 'Convert raw idea notes or prompt into structured feature specification in docs/ideas/specs/',
    matchers: ['create feature spec', 'new feature spec', 'write feature spec'],
    action: 'create-feature-spec',
  },
  {
    id: 'report-issue',
    title: 'Report Standardized Issue',
    category: 'Task Management',
    description: 'Convert bug reports or error descriptions into standardized issue specifications',
    matchers: ['report issue', 'file bug report', 'report bug', 'file issue'],
    action: 'report-issue',
  },
  {
    id: 'create-robos-app',
    title: 'Scaffold New RobOS App',
    category: 'Development',
    description: 'Create and scaffold a new RobOS Electron desktop app with full registration',
    matchers: ['create robos app', 'scaffold robos app', 'new desktop app'],
    action: 'create-robos-app',
  },
  {
    id: 'remove-robos-app',
    title: 'Remove RobOS Desktop App',
    category: 'Development',
    description: 'Remove a RobOS desktop application and cleanly deregister it across all manifests',
    matchers: ['remove robos app', 'uninstall robos app', 'delete robos app'],
    action: 'remove-robos-app',
  },
  {
    id: 'rename-robos-app',
    title: 'Rename RobOS Desktop App',
    category: 'Development',
    description: 'Rename a RobOS desktop application updating package directory, desktop entry, and icons',
    matchers: ['rename robos app', 'rename app'],
    action: 'rename-robos-app',
  },
  {
    id: 'update-app-icon',
    title: 'Update App SVG Icon',
    category: 'Development',
    description: 'Replace or create the 48x48 Lucide-style SVG icon for an app and sync registries',
    matchers: ['update app icon', 'change app icon', 'replace app icon'],
    action: 'update-app-icon',
  },
  {
    id: 'install-desktop-app',
    title: 'Install Linux Desktop Entry & Icon',
    category: 'System',
    description: 'Install .desktop entry and icon on GNOME Linux with desktop shortcuts',
    matchers: ['install desktop app', 'register desktop app', 'install dot desktop'],
    action: 'install-desktop-app',
  },
  {
    id: 'install-dev-deps',
    title: 'Audit & Install Dev Dependencies',
    category: 'System',
    description: 'Audit, verify, and install all host development dependencies for RobOS',
    matchers: ['install dev dependencies', 'audit dev deps', 'install dev tools'],
    action: 'install-dev-deps',
  },
  {
    id: 'manage-agent-personas',
    title: 'Manage Developer Agent Personas',
    category: 'AI',
    description: 'Configure Developer Agent Personas, execution modes, and IDE refactoring suites',
    matchers: ['manage agent personas', 'agent personas', 'configure agent personas'],
    action: 'manage-agent-personas',
  },
  {
    id: 'manage-robos-skill',
    title: 'Manage RobOS Skills Marketplace',
    category: 'AI',
    description: 'Add, update, or remove a RobOS AI skill in the marketplace across agent platforms',
    matchers: ['manage skill', 'manage robos skill', 'update robos skill'],
    action: 'manage-robos-skill',
  },
  {
    id: 'add-ai-text-area-to-app',
    title: 'Add AI Text Area Widget to App',
    category: 'RobOS AI',
    description: 'Add the standard <robos-ai-textarea> widget with auto-resize and @mention typeahead',
    matchers: ['add ai textarea', 'add ai text area to app', 'add ai textarea to app'],
    action: 'add-ai-text-area-to-app',
  },
  {
    id: 'add-install-step',
    title: 'Add Provisioning Step to Cloud-Init',
    category: 'DevOps',
    description: 'Add a new installation provisioning step to cloud-init and ASCII boot splash',
    matchers: ['add install step', 'add provisioning step', 'add cloud init step'],
    action: 'add-install-step',
  },
  {
    id: 'app-snapshot',
    title: 'Capture App DOM Snapshot',
    category: 'Development',
    description: 'Capture DOM snapshot (text, JSON, or screenshot) from running Electron app',
    matchers: ['app snapshot', 'capture app snapshot', 'dom snapshot', 'take app snapshot'],
    action: 'app-snapshot',
  },
  {
    id: 'ide-java',
    title: 'Automate Java in IntelliJ IDEA',
    category: 'Development',
    description: 'Automate Java in IntelliJ IDEA over port 63343 IPC & MCP bridge',
    matchers: ['ide java', 'automate intellij', 'java ide run config'],
    action: 'ide-java',
  },
  {
    id: 'crpg-game-builder',
    title: 'cRPG Game Builder & Maintenance',
    category: 'Game Development',
    description: 'Build, validate, and maintain tactical isometric cRPG in Godot 4',
    matchers: ['build crpg', 'crpg game builder', 'build rpg game'],
    action: 'crpg-game-builder',
  },
  {
    id: 'build-vm',
    title: 'Build RobOS VM Disk Image',
    category: 'DevOps',
    description: 'Build the RobOS QEMU/KVM virtual machine disk image and cloud-init ISO from scratch',
    matchers: ['build vm', 'build virtual machine', 'build qemu image'],
    action: 'build-vm',
  },
  {
    id: 'start-vm',
    title: 'Start RobOS Virtual Machine',
    category: 'DevOps',
    description: 'Start the RobOS QEMU virtual machine with optional display flags',
    matchers: ['start vm', 'start virtual machine', 'boot vm', 'launch vm'],
    action: 'start-vm',
  },
  {
    id: 'stop-vm',
    title: 'Stop RobOS Virtual Machine',
    category: 'DevOps',
    description: 'Gracefully shut down or terminate the RobOS QEMU virtual machine',
    matchers: ['stop vm', 'shutdown vm', 'stop virtual machine', 'halt vm'],
    action: 'stop-vm',
  },
  {
    id: 'vm-status',
    title: 'Check RobOS VM Status',
    category: 'DevOps',
    description: 'Check QEMU VM status, SSH reachability, memory, disk, and installed apps',
    matchers: ['vm status', 'check vm status', 'virtual machine status'],
    action: 'vm-status',
  },
  {
    id: 'vm-ssh',
    title: 'Execute Command on VM via SSH',
    category: 'DevOps',
    description: 'Execute shell commands on the running RobOS virtual machine via SSH (port 2224)',
    matchers: ['vm ssh', 'ssh into vm', 'run on vm'],
    action: 'vm-ssh',
  },
  {
    id: 'deploy-to-vm',
    title: 'Deploy Packages to RobOS VM',
    category: 'DevOps',
    description: 'Deploy one or more packages, apps, or libraries to the running RobOS VM',
    matchers: ['deploy to vm', 'deploy package to vm', 'push to vm'],
    action: 'deploy-to-vm',
  },
  {
    id: 'robos-voice',
    title: 'RobOS Voice Subsystem & Settings',
    category: 'RobOS AI',
    description: 'Manage bi-directional Kokoro/Whisper voice assistant, audio streams, and settings',
    matchers: ['robos voice', 'voice settings', 'voice assistant', 'voice configuration'],
    action: 'robos-voice',
  },
];

/**
 * Built-in RobOS Applications list (from packages/robos-icons/index.js)
 */
let _builtinApps = null;
function getBuiltinApps() {
  if (_builtinApps) return _builtinApps;
  try {
    const iconPkg = require('../../robos-icons');
    if (iconPkg && Array.isArray(iconPkg.BUILTIN_APPS)) {
      _builtinApps = iconPkg.BUILTIN_APPS;
      return _builtinApps;
    }
  } catch {}
  return [];
}

/**
 * Generates natural language trigger phrases for an application
 */
function generateAppMatchers(appId, label) {
  const normLabel = normalizeText(label);
  const normId = appId.replace(/[-_]/g, ' ');

  const phrases = new Set();
  phrases.add(`open ${normLabel}`);
  phrases.add(`launch ${normLabel}`);
  phrases.add(`start ${normLabel}`);
  phrases.add(normLabel);

  if (normId !== normLabel) {
    phrases.add(`open ${normId}`);
    phrases.add(`launch ${normId}`);
    phrases.add(normId);
  }

  // App-specific conversational phrases
  if (appId === 'task-planner' || appId === 'task-explorer') {
    phrases.add('open task explorer');
    phrases.add('open task planner');
    phrases.add('open tasks');
    phrases.add('plan task');
    phrases.add('task explorer');
    phrases.add('task planner');
  } else if (appId === 'git-projects') {
    phrases.add('open git projects');
    phrases.add('manage repositories');
    phrases.add('view git projects');
  } else if (appId === 'dev-central') {
    phrases.add('open dev central');
    phrases.add('show sprint board');
    phrases.add('dev dashboard');
  } else if (appId === 'kube-studio') {
    phrases.add('open kube studio');
    phrases.add('kubernetes studio');
    phrases.add('k8s clusters');
  } else if (appId === 'rest-client') {
    phrases.add('open rest client');
    phrases.add('bruno client');
    phrases.add('api client');
    phrases.add('test api');
  } else if (appId === 'db-manager') {
    phrases.add('open db manager');
    phrases.add('database manager');
    phrases.add('sql manager');
    phrases.add('open database');
  } else if (appId === 'nosql-manager') {
    phrases.add('open nosql manager');
    phrases.add('mongo manager');
    phrases.add('redis manager');
  } else if (appId === 'agent-chat') {
    phrases.add('open agent chat');
    phrases.add('chat with agent');
    phrases.add('ask agent');
  } else if (appId === 'schema-studio') {
    phrases.add('open schema studio');
    phrases.add('schema registry');
    phrases.add('ontology explorer');
  } else if (appId === 'crpg-editor') {
    phrases.add('open crpg editor');
    phrases.add('campaign editor');
    phrases.add('character sheet editor');
  } else if (appId === 'voice-prompt') {
    phrases.add('open robos voice');
    phrases.add('open voice');
    phrases.add('robos voice');
  } else if (appId === 'pr-review') {
    phrases.add('open pr review');
    phrases.add('pull request review');
    phrases.add('review board');
  } else if (appId === 'robos-elearning') {
    phrases.add('open elearning');
    phrases.add('learning courses');
    phrases.add('take course');
  } else if (appId === 'robos-documentation') {
    phrases.add('open documentation');
    phrases.add('living docs');
    phrases.add('read docs');
  } else if (appId === 'issue-manager') {
    phrases.add('open issue manager');
    phrases.add('github issues');
    phrases.add('view issues');
  } else if (appId === 'pass-manager') {
    phrases.add('open pass manager');
    phrases.add('password store');
    phrases.add('gpg passwords');
  }

  return Array.from(phrases);
}

class VoiceCommandsRegistry {
  constructor() {
    this._commands = new Map();
    this._initialized = false;
    this._init();
  }

  _init() {
    if (this._initialized) return;

    // 1. Register App Voice Commands
    const apps = getBuiltinApps();
    for (const app of apps) {
      const matchers = generateAppMatchers(app.appId, app.label);
      const cmdId = `cmd-app-${app.appId}`;
      const cmdNode = {
        '@id': `urn:robos:voice-command:${app.appId}`,
        '@type': ['robos:VoiceCommand', 'oslc_am:Resource'],
        id: cmdId,
        slug: app.appId,
        title: `Open ${app.label}`,
        category: app.category || 'Development',
        description: `Launch and focus the ${app.label} application`,
        targetType: 'app',
        targetId: app.appId,
        action: 'open-app',
        matchers: matchers,
        iconSvg: app.iconSvg,
        hasWildcard: false,
      };
      this._commands.set(cmdId, cmdNode);
    }

    // 2. Register Skill Voice Commands
    for (const skill of SKILL_VOICE_DEFINITIONS) {
      const cmdId = `cmd-skill-${skill.id}`;
      const cmdNode = {
        '@id': `urn:robos:voice-command:${skill.id}`,
        '@type': ['robos:VoiceCommand', 'oslc_am:Resource'],
        id: cmdId,
        slug: skill.id,
        title: skill.title,
        category: skill.category || 'Skills',
        description: skill.description,
        targetType: 'skill',
        targetId: skill.id,
        action: skill.action || skill.id,
        matchers: skill.matchers,
        iconSvg: null,
        hasWildcard: Boolean(skill.hasWildcard),
      };
      this._commands.set(cmdId, cmdNode);
    }

    this._initialized = true;
  }

  /**
   * Get all registered voice commands
   */
  getAllCommands() {
    return Array.from(this._commands.values());
  }

  /**
   * Get commands for applications only
   */
  getAppCommands() {
    return this.getAllCommands().filter(c => c.targetType === 'app');
  }

  /**
   * Get commands for skills only
   */
  getSkillCommands() {
    return this.getAllCommands().filter(c => c.targetType === 'skill');
  }

  /**
   * Find a command by ID or @id URI
   */
  getCommand(idOrUri) {
    if (!idOrUri) return null;
    if (this._commands.has(idOrUri)) {
      return this._commands.get(idOrUri);
    }
    for (const cmd of this._commands.values()) {
      if (cmd['@id'] === idOrUri || cmd.id === idOrUri || cmd.targetId === idOrUri) {
        return cmd;
      }
    }
    return null;
  }

  /**
   * Search commands by query and category filter ('all' | 'apps' | 'skills')
   */
  searchCommands(query = '', category = 'all') {
    const q = normalizeText(query);
    let list = this.getAllCommands();

    if (category === 'apps') {
      list = list.filter(c => c.targetType === 'app');
    } else if (category === 'skills') {
      list = list.filter(c => c.targetType === 'skill');
    }

    if (!q) return list;

    return list.filter(c => {
      if (normalizeText(c.title).includes(q)) return true;
      if (normalizeText(c.description).includes(q)) return true;
      if (normalizeText(c.targetId).includes(q)) return true;
      return c.matchers.some(m => normalizeText(m).includes(q));
    });
  }

  /**
   * Match a spoken transcript against all registered voice commands.
   * Tolerates conversational prefixes ('hey robos', 'please', 'could you')
   * and extracts trailing arguments for wildcard commands.
   *
   * @param {string} transcript Spoken text
   * @returns {{ matched: boolean, command?: object, args?: string, rawTranscript: string }}
   */
  matchCommand(transcript = '') {
    const raw = (transcript || '').trim();
    if (!raw) return { matched: false, rawTranscript: raw };

    // Strip common conversational filler words at start
    let cleaned = raw
      .replace(/^(?:hey|hello|hi|ok|okay)?\s*(?:robos|rob\s+os|row\s+bose)?\s*[,;:]?\s*/i, '')
      .replace(/^(?:please|can\s+you|could\s+you|would\s+you)?\s*/i, '')
      .trim();

    const normText = normalizeText(cleaned || raw);
    if (!normText) return { matched: false, rawTranscript: raw };

    // 1. Direct / Exact & Prefix Match against registered matchers
    // Check skills first (more specific intents) then apps
    const all = this.getAllCommands();
    const skills = all.filter(c => c.targetType === 'skill');
    const apps = all.filter(c => c.targetType === 'app');

    // Priority 1: Check skills
    for (const cmd of skills) {
      for (const pattern of cmd.matchers) {
        const normPattern = normalizeText(pattern);
        if (normText === normPattern) {
          return { matched: true, command: cmd, args: '', rawTranscript: raw };
        }
        // Wildcard prefix match: e.g. "search knowledge graph for microservices"
        if (cmd.hasWildcard) {
          if (normText.startsWith(normPattern + ' ')) {
            const remainder = normText.slice(normPattern.length).trim().replace(/^(?:for|about|to)\s+/i, '');
            return { matched: true, command: cmd, args: remainder, rawTranscript: raw };
          }
          if (normPattern.includes('*')) {
            const parts = normPattern.split('*').map(p => p.trim());
            if (parts.length === 2 && normText.startsWith(parts[0]) && normText.endsWith(parts[1])) {
              const arg = normText.slice(parts[0].length, normText.length - parts[1].length).trim();
              return { matched: true, command: cmd, args: arg, rawTranscript: raw };
            }
          }
        }
      }
    }

    // Priority 2: Check apps
    for (const cmd of apps) {
      for (const pattern of cmd.matchers) {
        const normPattern = normalizeText(pattern);
        if (normText === normPattern) {
          return { matched: true, command: cmd, args: '', rawTranscript: raw };
        }
        // Prefix with "open/launch/start"
        if (normText === `open ${normPattern}` || normText === `launch ${normPattern}`) {
          return { matched: true, command: cmd, args: '', rawTranscript: raw };
        }
      }
    }

    // Priority 3: Contains match for multi-word trigger phrases
    for (const cmd of skills) {
      for (const pattern of cmd.matchers) {
        const normPattern = normalizeText(pattern);
        if (normPattern.split(/\s+/).length >= 2 && normText.includes(normPattern)) {
          return { matched: true, command: cmd, args: '', rawTranscript: raw };
        }
      }
    }

    for (const cmd of apps) {
      for (const pattern of cmd.matchers) {
        const normPattern = normalizeText(pattern);
        if (normPattern.split(/\s+/).length >= 2 && normText.includes(normPattern)) {
          return { matched: true, command: cmd, args: '', rawTranscript: raw };
        }
      }
    }

    return { matched: false, rawTranscript: raw };
  }

  /**
   * Serialize commands as standard JSON-LD nodes conforming to urn:robos:shape:VoiceCommandShape
   */
  toKnowledgeGraphNodes() {
    return this.getAllCommands().map(c => ({
      '@id': c['@id'],
      '@type': ['robos:VoiceCommand', 'oslc_am:Resource'],
      'dcterms:title': c.title,
      'dcterms:description': c.description,
      'robos:commandMatcher': c.matchers,
      'robos:targetType': c.targetType,
      'robos:targetId': c.targetId,
      'robos:action': c.action,
      'robos:category': c.category,
      'robos:schemaOrgType': 'https://schema.org/ControlAction',
      'robos:domainStandard': 'https://schema.org/ControlAction',
      'robos:refersFrom': 'https://schema.org/ControlAction'
    }));
  }
}

const defaultRegistry = new VoiceCommandsRegistry();

module.exports = {
  VoiceCommandsRegistry,
  defaultRegistry,
  normalizeText,
  SKILL_VOICE_DEFINITIONS,
};
