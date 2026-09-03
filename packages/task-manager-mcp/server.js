'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMCPServer } = require('../robos-mcp-lib/index');

const HOME_DIR = process.env.HOME || os.homedir();
const TASKS_DIR = path.join(HOME_DIR, '.config', 'robos', 'tasks');
const TASKS_FILE = path.join(TASKS_DIR, 'tasks.json');

const DEFAULT_TASKS = [
  {
    id: 'TASK-101',
    title: 'Implement MCP Server Registry & Router',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    type: 'story',
    assignee: 'agent-task-101',
    epic: 'mcp-servers',
    hoursLogged: 4.5,
    comments: [
      'Initial specification approved.',
      'Unit test suite created.',
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'TASK-102',
    title: 'Create Multi-Repo Worktree Sandbox Orchestrator',
    status: 'TODO',
    priority: 'MEDIUM',
    type: 'story',
    assignee: 'unassigned',
    epic: 'workspace-management',
    hoursLogged: 0,
    comments: [],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'TASK-103',
    title: 'Automated Blast Radius Scanner',
    status: 'TODO',
    priority: 'HIGH',
    type: 'bug',
    assignee: 'unassigned',
    epic: 'dual-state-sdlc-knowledge-graph',
    hoursLogged: 0,
    comments: [],
    updatedAt: new Date().toISOString(),
  },
];

class TaskManagerService {
  constructor(options = {}) {
    this.tasks = new Map();
    this.tasksFile = options.tasksFile || TASKS_FILE;
    this.init();
  }

  init() {
    if (fs.existsSync(this.tasksFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.tasksFile, 'utf8'));
        for (const t of list) this.tasks.set(t.id, t);
        return;
      } catch {}
    }
    for (const t of DEFAULT_TASKS) {
      this.tasks.set(t.id, { ...t });
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.tasksFile), { recursive: true });
      fs.writeFileSync(this.tasksFile, JSON.stringify(Array.from(this.tasks.values()), null, 2), 'utf8');
    } catch {}
  }

  list(filters = {}) {
    let result = Array.from(this.tasks.values());
    if (filters.status) result = result.filter(t => t.status.toLowerCase() === filters.status.toLowerCase());
    if (filters.assignee) result = result.filter(t => t.assignee.toLowerCase() === filters.assignee.toLowerCase());
    if (filters.epic) result = result.filter(t => t.epic && t.epic.toLowerCase() === filters.epic.toLowerCase());
    return result;
  }

  get(id) {
    return this.tasks.get(id) || null;
  }

  create(data = {}) {
    const nextId = `TASK-${Math.floor(Math.random() * 900 + 100)}`;
    const task = {
      id: data.id || nextId,
      title: data.title || 'Untitled Task',
      status: data.status || 'TODO',
      priority: data.priority || 'MEDIUM',
      type: data.type || 'story',
      assignee: data.assignee || 'unassigned',
      epic: data.epic || 'general',
      hoursLogged: 0,
      comments: [],
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    this.save();
    return task;
  }

  update(id, fields = {}) {
    const task = this.tasks.get(id);
    if (!task) return null;
    Object.assign(task, fields, { updatedAt: new Date().toISOString() });
    this.save();
    return task;
  }

  advanceWorkflow(id) {
    const task = this.tasks.get(id);
    if (!task) return null;

    const stages = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
    const currIdx = stages.indexOf(task.status);
    const nextStage = currIdx >= 0 && currIdx < stages.length - 1 ? stages[currIdx + 1] : 'DONE';

    task.status = nextStage;
    task.updatedAt = new Date().toISOString();
    this.save();
    return task;
  }

  addComment(id, comment) {
    const task = this.tasks.get(id);
    if (!task) return null;
    task.comments.push(`[${new Date().toLocaleTimeString()}] ${comment}`);
    task.updatedAt = new Date().toISOString();
    this.save();
    return task;
  }

  logHours(id, hours) {
    const task = this.tasks.get(id);
    if (!task) return null;
    task.hoursLogged = (task.hoursLogged || 0) + Number(hours);
    task.updatedAt = new Date().toISOString();
    this.save();
    return task;
  }
}

function createTaskMCPServer(options = {}) {
  const service = new TaskManagerService(options);

  const server = createMCPServer({
    appId: 'task-manager',
    name: 'Task Manager MCP Server',
    version: '1.2.0',
    description: 'RobOS Task and Issue Management Model Context Protocol Server',
    port: options.port || null,
    tools: [
      {
        name: 'robos_tasks_list',
        description: 'List tasks with optional filters (status, assignee, epic).',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by status (TODO, IN_PROGRESS, REVIEW, DONE)' },
            assignee: { type: 'string', description: 'Filter by assignee' },
            epic: { type: 'string', description: 'Filter by epic' },
          },
        },
        handler: async (args) => service.list(args),
      },
      {
        name: 'robos_tasks_get',
        description: 'Get task details by ID.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Task ID (e.g. TASK-101)' } },
          required: ['id'],
        },
        handler: async (args) => {
          const task = service.get(args.id);
          if (!task) throw new Error(`Task not found: ${args.id}`);
          return task;
        },
      },
      {
        name: 'robos_tasks_create',
        description: 'Create a new task.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task Title' },
            priority: { type: 'string', description: 'Priority: LOW, MEDIUM, HIGH, CRITICAL' },
            type: { type: 'string', description: 'Type: story, bug, task, spike' },
            assignee: { type: 'string', description: 'Assignee username' },
          },
          required: ['title'],
        },
        handler: async (args) => service.create(args),
      },
      {
        name: 'robos_tasks_update',
        description: 'Update task fields.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task ID' },
            status: { type: 'string' },
            assignee: { type: 'string' },
            priority: { type: 'string' },
          },
          required: ['id'],
        },
        handler: async (args) => {
          const task = service.update(args.id, args);
          if (!task) throw new Error(`Task not found: ${args.id}`);
          return task;
        },
      },
      {
        name: 'robos_tasks_advance_workflow',
        description: 'Advance task to next workflow stage (TODO -> IN_PROGRESS -> REVIEW -> DONE).',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Task ID' } },
          required: ['id'],
        },
        handler: async (args) => {
          const task = service.advanceWorkflow(args.id);
          if (!task) throw new Error(`Task not found: ${args.id}`);
          return task;
        },
      },
      {
        name: 'robos_tasks_add_comment',
        description: 'Add a comment to a task.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task ID' },
            comment: { type: 'string', description: 'Comment text' },
          },
          required: ['id', 'comment'],
        },
        handler: async (args) => {
          const task = service.addComment(args.id, args.comment);
          if (!task) throw new Error(`Task not found: ${args.id}`);
          return task;
        },
      },
      {
        name: 'robos_tasks_log_hours',
        description: 'Log work hours on a task.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task ID' },
            hours: { type: 'number', description: 'Hours spent' },
          },
          required: ['id', 'hours'],
        },
        handler: async (args) => {
          const task = service.logHours(args.id, args.hours);
          if (!task) throw new Error(`Task not found: ${args.id}`);
          return task;
        },
      },
    ],
    resources: [
      {
        uri: 'robos://task-manager/tasks/active',
        name: 'Active In-Progress Tasks',
        mimeType: 'application/json',
        handler: async () => service.list({ status: 'IN_PROGRESS' }),
      },
      {
        uri: 'robos://task-manager/tasks/all',
        name: 'All Registered Tasks',
        mimeType: 'application/json',
        handler: async () => service.list(),
      },
    ],
  });

  return { server, service };
}

module.exports = { createTaskMCPServer, TaskManagerService };
