'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DEFAULT_TEMPLATES } = require('./default-templates');

const CUSTOM_TEMPLATES_DIR = path.join(os.homedir(), '.config', 'robos', 'task-planner', 'custom-templates');

function ensureCustomDir() {
  fs.mkdirSync(CUSTOM_TEMPLATES_DIR, { recursive: true });
}

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'custom-template-' + Date.now();
}

class TemplateManager {
  constructor(customDir = CUSTOM_TEMPLATES_DIR) {
    this.customDir = customDir;
    this.defaultTemplates = DEFAULT_TEMPLATES;
  }

  ensureDir() {
    fs.mkdirSync(this.customDir, { recursive: true });
  }

  listCustomTemplates() {
    this.ensureDir();
    try {
      const files = fs.readdirSync(this.customDir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          const content = fs.readFileSync(path.join(this.customDir, f), 'utf8');
          const t = JSON.parse(content);
          return { ...t, isCustom: true };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  listTemplates() {
    const builtins = this.defaultTemplates.map(t => ({
      id: t.id,
      title: t.title,
      category: t.category,
      icon: t.icon || '📋',
      description: t.description,
      fields: t.fields || [],
      isCustom: false,
    }));
    const customs = this.listCustomTemplates();
    return [...builtins, ...customs];
  }

  getCategories() {
    const templates = this.listTemplates();
    const categories = new Set();
    templates.forEach(t => { if (t.category) categories.add(t.category); });
    return Array.from(categories);
  }

  getTemplate(id) {
    if (!id) return null;
    // Check built-ins first
    let builtin = this.defaultTemplates.find(t => t.id === id);
    if (!builtin && typeof id === 'string') {
      const clean = s => s.toLowerCase().replace(/^(create|add|plan-to-create|plan-to-add)-/, '').replace(/-(web|service|app|game|library)/g, '');
      const targetClean = clean(id);
      builtin = this.defaultTemplates.find(t => {
        const tClean = clean(t.id);
        return t.id.includes(id) || id.includes(t.id) || tClean === targetClean || t.title.toLowerCase().includes(id.toLowerCase().replace(/-/g, ' '));
      });
    }
    if (builtin) {
      return { ...builtin, isCustom: false };
    }
    // Check custom
    this.ensureDir();
    const customFile = path.join(this.customDir, `${id}.json`);
    if (fs.existsSync(customFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(customFile, 'utf8'));
        return { ...parsed, isCustom: true };
      } catch {}
    }
    return null;
  }

  saveCustomTemplate(raw) {
    if (!raw || !raw.title) {
      return { ok: false, error: 'Template title is required.' };
    }
    this.ensureDir();
    const id = raw.id ? slugify(raw.id) : slugify(raw.title);
    
    // Disallow overriding built-in IDs directly or mark as custom prefix
    const existsBuiltin = this.defaultTemplates.some(t => t.id === id);
    const finalId = existsBuiltin ? `custom-${id}` : id;

    const template = {
      id: finalId,
      title: raw.title.trim(),
      category: raw.category || 'Custom Templates',
      icon: raw.icon || '⭐',
      description: raw.description || 'User-defined custom task template.',
      fields: Array.isArray(raw.fields) ? raw.fields : [
        { id: 'targetName', label: 'Target / Component Name', type: 'text', default: 'my-custom-component', required: true },
        { id: 'requirements', label: 'Implementation Requirements', type: 'textarea', default: 'Core specifications and deliverables.' }
      ],
      customTasks: Array.isArray(raw.customTasks) ? raw.customTasks : [],
      updatedAt: Date.now(),
    };

    const filePath = path.join(this.customDir, `${finalId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf8');
    return { ok: true, template: { ...template, isCustom: true } };
  }

  deleteCustomTemplate(id) {
    if (this.defaultTemplates.some(t => t.id === id)) {
      return { ok: false, error: 'Cannot delete built-in system template.' };
    }
    this.ensureDir();
    const filePath = path.join(this.customDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { ok: true };
    }
    return { ok: false, error: `Custom template "${id}" not found.` };
  }

  generatePlan(templateId, answers = {}) {
    const template = this.getTemplate(templateId);
    if (!template) {
      return { ok: false, error: `Template "${templateId}" not found.` };
    }

    // If built-in template with a generator function
    if (typeof template.generatePlan === 'function') {
      try {
        const plan = template.generatePlan(answers);
        return { ok: true, ...plan };
      } catch (e) {
        return { ok: false, error: `Failed to generate plan: ${e.message}` };
      }
    }

    // For custom templates: generate prompt and tasks
    const promptLines = [`Plan for: ${template.title}`];
    promptLines.push(`Category: ${template.category}`);
    promptLines.push(`Description: ${template.description}`);
    promptLines.push('\nUser Form Answers:');
    for (const field of (template.fields || [])) {
      const val = answers[field.id] !== undefined ? answers[field.id] : field.default;
      promptLines.push(`- ${field.label}: ${Array.isArray(val) ? val.join(', ') : val}`);
    }

    const nameVal = answers['targetName'] || answers['name'] || answers['title'] || template.title;
    const epicTitle = `Epic: ${template.title} — ${nameVal}`;
    const epicName = `${template.id}-plan`;

    let tasks = [];
    if (Array.isArray(template.customTasks) && template.customTasks.length > 0) {
      tasks = [
        {
          title: epicTitle,
          body: `Implementation plan for ${template.title} generated from custom template.`,
          labels: ['epic', 'custom-plan'],
          isEpic: true,
          epicName: epicName,
          parentEpicIdx: null,
          issueType: 'Epic',
        },
        ...template.customTasks.map((t, idx) => ({
          title: (t.title || `Task ${idx + 1}`).replace('{name}', nameVal),
          body: (t.body || '').replace('{name}', nameVal),
          labels: t.labels || ['custom-task'],
          isEpic: false,
          epicName: '',
          parentEpicIdx: 0,
          issueType: t.issueType || 'Story',
        }))
      ];
    } else {
      tasks = [
        {
          title: epicTitle,
          body: promptLines.join('\n'),
          labels: ['epic', 'custom-plan'],
          isEpic: true,
          epicName: epicName,
          parentEpicIdx: null,
          issueType: 'Epic',
        },
        {
          title: `${nameVal}: Architecture Design & Specifications`,
          body: `Define technical design, interfaces, and prerequisites based on:\n${promptLines.join('\n')}`,
          labels: ['architecture', 'design'],
          isEpic: false,
          epicName: '',
          parentEpicIdx: 0,
          issueType: 'Story',
        },
        {
          title: `${nameVal}: Core Implementation & Components`,
          body: `Implement foundational components and logic.`,
          labels: ['implementation'],
          isEpic: false,
          epicName: '',
          parentEpicIdx: 0,
          issueType: 'Story',
        },
        {
          title: `${nameVal}: Unit & Integration Testing`,
          body: `Validate functionality with automated tests and CI verification.`,
          labels: ['testing', 'qa'],
          isEpic: false,
          epicName: '',
          parentEpicIdx: 0,
          issueType: 'Story',
        },
      ];
    }

    return {
      ok: true,
      prompt: promptLines.join('\n'),
      tasks,
    };
  }
}

module.exports = {
  TemplateManager,
  CUSTOM_TEMPLATES_DIR,
};
