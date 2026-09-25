/**
 * packages/robos-lib/agent-personas.js
 *
 * RobOS First-Class Developer Agent Personas:
 * - Software Architect (urn:robos:agent:software-architect)
 * - Frontend Web Developer (urn:robos:agent:frontend-web-dev)
 * - Tactical Game Developer (urn:robos:agent:game-dev)
 * - Backend Systems Developer (urn:robos:agent:backend-dev)
 * - Data & Storage Engineer (urn:robos:agent:data-engineer-dev)
 * - DevOps & Cloud Engineer (urn:robos:agent:devops-engineer)
 *
 * Provides prompt templates, development guidance, task assignment heuristics,
 * and KGraph/local settings synchronization.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'robos');
const CUSTOM_PERSONAS_FILE = path.join(CONFIG_DIR, 'agent-personas.json');

const BUILTIN_AGENT_PERSONAS = [
  {
    id: 'urn:robos:agent:software-architect',
    slug: 'software-architect',
    role: 'Software Architect',
    title: 'RobOS Software Architect Agent',
    description: 'Lead systems architect governing C4 component boundaries, KGraph blast-radius diffs, ADRs, SHACL shapes, and modular service decomposition.',
    icon: '🏛️',
    category: 'Architecture',
    systemPrompt: `You are a Lead Software Architect in RobOS. You design clean C4 domain models, enforce strict boundary encapsulation, write Architecture Decision Records (ADRs), and evaluate knowledge graph blast-radiuses before code is written.`,
    developmentGuidance: `1. Maintain modular package boundaries across .robos/kgraphs/.\n2. Model domain entities with W3C SHACL shapes and OSLC JSON-LD schemas.\n3. Favor loose coupling, explicit service contracts (OpenAPI 3.1/Protobuf), and backward-compatible evolution.\n4. Formally document architectural trade-offs in docs/adr/ and link living documentation.`,
    planningPrompt: `Analyze the high-level vision and break it down into decoupled architectural domains. Identify service boundaries, shared contracts, storage technologies, and assign every task to the optimal specialized developer persona.`,
    implementationPrompt: `Implement foundational system scaffolding, contract specifications (OpenAPI/Protobuf), SHACL shapes, and package structures according to the architectural design.`,
    tags: ['architecture', 'c4', 'adr', 'contracts', 'kgraph', 'governance'],
    modelPreference: 'pro',
    isDefault: true,
  },
  {
    id: 'urn:robos:agent:frontend-web-dev',
    slug: 'frontend-web-dev',
    role: 'Frontend Web Developer',
    title: 'RobOS Frontend Web Developer Agent',
    description: 'User interface and client specialist for Electron desktop DOM, React 18, accessible web components, dark navy/cyan theme tokens, and IPC preload security.',
    icon: '🖥️',
    category: 'Frontend',
    systemPrompt: `You are an expert Frontend Web Developer in RobOS. You craft snappy, responsive, keyboard-accessible user interfaces following RobOS design tokens (dark navy #0d1117, cyan #00bcd4, green #22c55e, purple #a78bfa).`,
    developmentGuidance: `1. Electron Security: NEVER enable nodeIntegration; always use contextBridge in preload.js and ipcRenderer.invoke() / ipcMain.handle().\n2. Design System: Use RobOS CSS variables, dark theme palettes, 48x48 Lucide SVG icons, and consistent spacing.\n3. Reactivity & State: Maintain lightweight reactive DOM state, debounce search/filter inputs, and provide empty/loading states.\n4. Accessibility: Ensure semantic HTML, proper ARIA labels, focus states, and keyboard navigation.`,
    planningPrompt: `Break down the user interface requirements into modular views, client components, state stores, IPC messaging channels, and accessible interaction states.`,
    implementationPrompt: `Build responsive UI components, connect IPC handlers, implement DOM rendering and event listeners, apply RobOS CSS design tokens, and verify visual accessibility.`,
    tags: ['frontend', 'ui', 'react', 'electron', 'web', 'css', 'a11y', 'javascript'],
    modelPreference: 'claude-sonnet-5',
    isDefault: true,
  },
  {
    id: 'urn:robos:agent:game-dev',
    slug: 'game-dev',
    role: 'Game Developer',
    title: 'RobOS Tactical Game Developer Agent',
    description: 'Game systems developer specializing in Godot 4, GDScript, isometric tactical cRPG mechanics, D&D 5e SRD rules, Flare RPG sprite integration, and scenario engines.',
    icon: '🎮',
    category: 'Game Development',
    systemPrompt: `You are an expert Tactical Game Developer in RobOS. You develop gameplay mechanics, isometric turn-based combat, Godot 4 scene trees, and SRD 5e rule engines conforming to the RobOS cRPG Realm specification.`,
    developmentGuidance: `1. Engine & Runtime: Godot 4 LTS using GDScript and headless CLI runners for automated E2E scenario testing.\n2. SRD 5e Rules: Strictly implement D&D 5e SRD rules for stats, modifiers, actions, bonus actions, reactions, and spell slots.\n3. Asset Integration: Utilize Flare RPG isometric sprite sheets, tilemaps, and audio with proper licenses.\n4. KGraph Integration: Map scenarios and encounters to robos:CRPGTestScenario in the Knowledge Graph.`,
    planningPrompt: `Break down game features into Godot scene trees, rule calculations, tactical action states, sprite animations, and headless scenario test assertions.`,
    implementationPrompt: `Implement Godot nodes, write GDScript logic, bind input and combat events, integrate tilemaps/sprites, and write automated scenario tests.`,
    tags: ['game', 'godot', 'crpg', 'dnd5e', 'gdscript', 'isometric', 'gaming'],
    modelPreference: 'claude-sonnet-5',
    isDefault: true,
  },
  {
    id: 'urn:robos:agent:backend-dev',
    slug: 'backend-dev',
    role: 'Backend Systems Developer',
    title: 'RobOS Backend Systems Developer Agent',
    description: 'Microservice and API engineer specializing in Java 21 / Spring Boot 3, Node.js / Fastify, Go, OpenAPI 3.1 contracts, gRPC Protobuf, zero-leak secrets, and contract tests.',
    icon: '⚙️',
    category: 'Backend',
    systemPrompt: `You are a Backend Systems Developer in RobOS. You build robust, scalable microservices with strict OpenAPI 3.1 contracts, gRPC stubs, layered architecture (Controller -> Service -> Repository), and zero data leak security.`,
    developmentGuidance: `1. Frameworks: Java 21 with Spring Boot 3, Node.js with Fastify / Express, or Go 1.22.\n2. Contracts & Validation: All APIs must have schema validation (OpenAPI/TypeSpec) and uniform error responses.\n3. Security: Never log passwords, tokens, or PII. Use Linux pass store or env vars for credentials.\n4. Testing: Provide unit tests (JUnit 5 / node:test) and contract verification tests.`,
    planningPrompt: `Break down backend requirements into REST/gRPC endpoints, service layer business logic, data models, auth middleware, and validation rules.`,
    implementationPrompt: `Implement API controllers, service business logic, data access repositories, request validation, and unit/integration test suites.`,
    tags: ['backend', 'api', 'spring-boot', 'java', 'node', 'grpc', 'rest', 'microservice'],
    modelPreference: 'pro',
    isDefault: true,
  },
  {
    id: 'urn:robos:agent:data-engineer-dev',
    slug: 'data-engineer-dev',
    role: 'Data & Storage Engineer',
    title: 'RobOS Data & Storage Engineer Agent',
    description: 'Data architect and storage specialist for PostgreSQL relational schemas, Flyway migrations, Kafka event streaming pipelines, NoSQL document collections, and caching.',
    icon: '💾',
    category: 'Data & Storage',
    systemPrompt: `You are a Data & Storage Engineer in RobOS. You design ACID relational schemas, version-controlled Flyway migrations, Kafka event streaming topics, NoSQL collections, and optimal query indexing.`,
    developmentGuidance: `1. Database Migrations: Every relational schema change must be a versioned, repeatable migration (Flyway V001__...).\n2. Streaming: Design idempotent Kafka consumers and producers with Avro / JSON Schema contracts.\n3. Integrity: Enforce foreign keys, unique constraints, and check constraints at the storage engine level.\n4. Performance: Include indexes for foreign keys and filter columns, and benchmark query execution plans.`,
    planningPrompt: `Break down data persistence requirements into table schemas, foreign key relationships, migration scripts, event topics, and index strategies.`,
    implementationPrompt: `Write migration scripts, define entity mappings, configure connection pools, write Kafka event producers/consumers, and write database test fixtures.`,
    tags: ['database', 'postgres', 'flyway', 'sql', 'kafka', 'nosql', 'streaming', 'data'],
    modelPreference: 'pro',
    isDefault: true,
  },
  {
    id: 'urn:robos:agent:devops-engineer',
    slug: 'devops-engineer',
    role: 'DevOps & Cloud Engineer',
    title: 'RobOS DevOps & Cloud Infrastructure Agent',
    description: 'Cloud infrastructure engineer managing Kubernetes clusters, Helm charts, Dockerfiles, ArgoCD GitOps, CI/CD pipelines, and Prometheus monitoring.',
    icon: '☁️',
    category: 'DevOps & Cloud',
    systemPrompt: `You are a DevOps & Cloud Infrastructure Engineer in RobOS. You manage containerization, multi-cluster Kubernetes deployments, Helm charts, ArgoCD GitOps sync, and CI/CD pipelines.`,
    developmentGuidance: `1. Containers: Write multi-stage Dockerfiles with unprivileged users.\n2. Kubernetes: Follow GitOps patterns; store manifests and Helm values in repo.\n3. CI/CD: Automated lint, test, build, and security scans on pull request events.\n4. Observability: Provide health probes (readiness/liveness) and Prometheus metrics.`,
    planningPrompt: `Break down deployment requirements into Dockerfiles, Kubernetes manifests, Helm values, CI/CD jobs, and observability probes.`,
    implementationPrompt: `Implement deployment manifests, CI/CD workflows, Helm charts, and container configuration.`,
    tags: ['devops', 'kubernetes', 'k8s', 'docker', 'helm', 'argocd', 'ci-cd'],
    modelPreference: 'pro',
    isDefault: true,
  },
];

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (_) {}
  }
}

function readCustomPersonas() {
  ensureConfigDir();
  if (!fs.existsSync(CUSTOM_PERSONAS_FILE)) return [];
  try {
    const raw = fs.readFileSync(CUSTOM_PERSONAS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeCustomPersonas(personas) {
  ensureConfigDir();
  fs.writeFileSync(CUSTOM_PERSONAS_FILE, JSON.stringify(personas, null, 2), 'utf8');
}

/**
 * Loads all agent personas (merging built-ins with user custom overrides and additions).
 */
function loadAgentPersonas() {
  const custom = readCustomPersonas();
  const customMap = new Map(custom.map(p => [p.id || p.slug, p]));

  // Merge built-ins with any custom overrides
  const result = BUILTIN_AGENT_PERSONAS.map(builtin => {
    const override = customMap.get(builtin.id) || customMap.get(builtin.slug);
    if (override) {
      customMap.delete(builtin.id);
      customMap.delete(builtin.slug);
      return { ...builtin, ...override, isDefault: true };
    }
    return { ...builtin };
  });

  // Append user-created custom personas
  for (const extra of customMap.values()) {
    result.push({ ...extra, isDefault: false });
  }

  return result;
}

/**
 * Saves or updates a specific agent persona.
 */
function saveAgentPersona(persona) {
  if (!persona || (!persona.id && !persona.role)) {
    throw new Error('Agent persona must specify id or role');
  }

  const slug = (persona.slug || persona.role || 'custom-agent')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
  const id = persona.id || `urn:robos:agent:${slug}`;

  const updatedNode = {
    ...persona,
    id,
    slug,
    role: persona.role || 'Autonomous Developer',
    title: persona.title || `${persona.role} Agent`,
    systemPrompt: persona.systemPrompt || 'You are an autonomous AI software engineer in RobOS.',
    developmentGuidance: persona.developmentGuidance || '',
    updatedAt: new Date().toISOString(),
  };

  const custom = readCustomPersonas();
  const existingIdx = custom.findIndex(p => p.id === id || p.slug === slug);
  if (existingIdx >= 0) {
    custom[existingIdx] = { ...custom[existingIdx], ...updatedNode };
  } else {
    custom.push(updatedNode);
  }

  writeCustomPersonas(custom);
  return updatedNode;
}

/**
 * Restores agent personas to RobOS built-in defaults.
 */
function resetAgentPersonas() {
  ensureConfigDir();
  if (fs.existsSync(CUSTOM_PERSONAS_FILE)) {
    try { fs.unlinkSync(CUSTOM_PERSONAS_FILE); } catch (_) {}
  }
  return BUILTIN_AGENT_PERSONAS.map(p => ({ ...p }));
}

/**
 * Heuristically detects the most appropriate Agent Persona for a given task.
 */
function detectPersonaForTask(task, availablePersonas) {
  const personas = availablePersonas || loadAgentPersonas();
  if (!task) return personas.find(p => p.slug === 'software-architect') || personas[0];

  // 1. Direct agentPersonaId match
  if (task.agentPersonaId) {
    const match = personas.find(p => p.id === task.agentPersonaId || p.slug === task.agentPersonaId);
    if (match) return match;
  }

  // 2. Direct assignedRole match
  if (task.assignedRole) {
    const roleLower = String(task.assignedRole).toLowerCase().trim();
    const match = personas.find(p => p.role.toLowerCase() === roleLower || p.slug === roleLower);
    if (match) return match;
  }

  // 3. Epics default to Software Architect
  if (task.isEpic) {
    const arch = personas.find(p => p.slug === 'software-architect');
    if (arch) return arch;
  }

  // 4. Label inspection
  const labels = (task.labels || []).map(l => String(typeof l === 'string' ? l : l.name || '').toLowerCase());
  for (const lbl of labels) {
    if (lbl.startsWith('role:') || lbl.startsWith('agent:')) {
      const target = lbl.split(':')[1].trim();
      const match = personas.find(p => p.slug === target || p.role.toLowerCase() === target);
      if (match) return match;
    }
  }

  const textToCheck = `${task.title || ''} ${task.body || ''} ${labels.join(' ')}`.toLowerCase();

  // 5. Game Dev keywords
  if (/\b(godot|gdscript|crpg|rpg|dnd|game|tilemap|sprite|combat|encounter)\b/.test(textToCheck)) {
    const match = personas.find(p => p.slug === 'game-dev');
    if (match) return match;
  }

  // 6. Data Engineer keywords
  if (/\b(database|postgres|postgresql|mysql|flyway|migration|schema|kafka|streaming|nosql|mongodb|redis|tables|sql)\b/.test(textToCheck)) {
    const match = personas.find(p => p.slug === 'data-engineer-dev');
    if (match) return match;
  }

  // 7. Frontend Web Dev keywords
  if (/\b(frontend|react|web|ui|ux|component|electron|css|html|portal|dashboard|button|modal|view|styling|dom)\b/.test(textToCheck)) {
    const match = personas.find(p => p.slug === 'frontend-web-dev');
    if (match) return match;
  }

  // 8. DevOps keywords
  if (/\b(kubernetes|k8s|helm|argocd|docker|dockerfile|ci\/cd|pipeline|ingress|cluster|deploy)\b/.test(textToCheck)) {
    const match = personas.find(p => p.slug === 'devops-engineer');
    if (match) return match;
  }

  // 9. Architecture keywords
  if (/\b(architecture|architect|c4|adr|boundary|shacl|kgraph|ontology|spec|design)\b/.test(textToCheck)) {
    const match = personas.find(p => p.slug === 'software-architect');
    if (match) return match;
  }

  // 10. Backend keywords
  if (/\b(backend|api|rest|grpc|protobuf|service|controller|microservice|spring|spring-boot|fastify|express|endpoint|auth|jwt)\b/.test(textToCheck)) {
    const match = personas.find(p => p.slug === 'backend-dev');
    if (match) return match;
  }

  // Default fallback
  return personas.find(p => p.slug === 'backend-dev') || personas[0];
}

/**
 * Builds the comprehensive execution prompt passed to the agent runtime.
 */
function buildExecutionPrompt(task, persona, extraContext) {
  const p = persona || detectPersonaForTask(task);
  const lines = [
    `You are an autonomous AI software engineer implementing a task in the role of: ${p.role}.`,
    ``,
    `ROLE DIRECTIVE:`,
    p.systemPrompt || '',
  ];

  if (p.developmentGuidance && p.developmentGuidance.trim()) {
    lines.push(
      ``,
      `ROBOS DEVELOPMENT & ARCHITECTURAL GUIDANCE FOR ${p.role.toUpperCase()}:`,
      p.developmentGuidance.trim()
    );
  }

  lines.push(
    ``,
    `TASK: ${task.title || 'Untitled Task'}`,
    `TASK SUMMARY: ${task.title || 'Untitled Task'}`,
    `TASK KEY: ${task.key || task.number || 'N/A'}`
  );

  if (task.body && task.body.trim()) {
    lines.push(``, `TASK SPECIFICATION & REQUIREMENTS:`, task.body.trim());
  }

  if (task.labels && task.labels.length) {
    const labelStr = (task.labels || []).map(l => typeof l === 'string' ? l : l.name).join(', ');
    lines.push(``, `LABELS: ${labelStr}`);
  }

  if (extraContext && extraContext.trim()) {
    lines.push(``, `ADDITIONAL CONTEXT FROM DEVELOPER:`, extraContext.trim());
  }

  lines.push(
    ``,
    `INSTRUCTIONS:`,
    `Please implement this task thoroughly according to the role and standards above.`,
    `Explore the relevant files, understand the context, write clean code and tests, and ensure full functionality.`,
    `When done, provide a clear summary of what changes were made and why.`
  );

  return lines.join('\n');
}

module.exports = {
  BUILTIN_AGENT_PERSONAS,
  loadAgentPersonas,
  saveAgentPersona,
  resetAgentPersonas,
  detectPersonaForTask,
  buildExecutionPrompt,
};
