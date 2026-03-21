'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Resolve template variables in a string.
 * Supports {{payload.field}}, {{type}}, {{now}}, {{user}}, {{steps[N].output}}.
 */
function resolveTemplate(template, context = {}) {
  if (typeof template !== 'string') return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    const trimmed = expr.trim();

    // Built-in variables
    if (trimmed === 'now') return new Date().toISOString();
    if (trimmed === 'user') return os.userInfo().username;
    if (trimmed === 'hostname') return os.hostname();

    // steps[N].output
    const stepsMatch = trimmed.match(/^steps\[(\d+)\]\.output$/);
    if (stepsMatch && context.steps) {
      const idx = parseInt(stepsMatch[1], 10);
      if (context.steps[idx] && context.steps[idx].output !== undefined) {
        const val = context.steps[idx].output;
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      }
      return match;
    }

    // Dot-notation field access on context (event envelope)
    const parts = trimmed.split('.');
    let value = context;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return match;
      value = value[part];
    }

    if (value === undefined || value === null) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/**
 * Resolve all template variables in an object's string values.
 */
function resolveParams(params, context) {
  const resolved = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      resolved[key] = resolveTemplate(value, context);
    } else if (Array.isArray(value)) {
      resolved[key] = value.map(v => typeof v === 'string' ? resolveTemplate(v, context) : v);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * ActionRegistry — manages and executes action types.
 */
class ActionRegistry {
  constructor() {
    this._types = new Map();
  }

  /**
   * Register an action type.
   */
  register(actionDef) {
    if (!actionDef.type) throw new Error('Action definition must have a type');
    this._types.set(actionDef.type, actionDef);
  }

  /**
   * List all registered action type IDs.
   */
  listTypes() {
    return [...this._types.keys()];
  }

  /**
   * Get a full action type definition.
   */
  getType(id) {
    return this._types.get(id) || null;
  }

  /**
   * Get the parameter schema for an action type.
   */
  getParamSchema(id) {
    const actionType = this._types.get(id);
    return actionType ? actionType.params : null;
  }

  /**
   * Validate parameters against the action type's schema.
   */
  validate(type, params) {
    const actionType = this._types.get(type);
    if (!actionType) {
      return { valid: false, errors: [`Unknown action type: ${type}`] };
    }

    const errors = [];
    const schema = actionType.params || {};

    for (const [key, def] of Object.entries(schema)) {
      const value = params[key];

      // Check required
      if (def.required && (value === undefined || value === null || value === '')) {
        errors.push(`Missing required parameter: ${key}`);
        continue;
      }

      if (value === undefined || value === null) continue;

      // Check enum
      if (def.type === 'enum' && def.values && !def.values.includes(value)) {
        errors.push(`Invalid value for ${key}: ${value}. Must be one of: ${def.values.join(', ')}`);
      }

      // Check type
      if (def.type === 'number' && typeof value !== 'number') {
        errors.push(`Parameter ${key} must be a number`);
      }
      if (def.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Parameter ${key} must be a boolean`);
      }
    }

    return errors.length === 0 ? { valid: true } : { valid: false, errors };
  }

  /**
   * Execute an action with template resolution.
   */
  async execute(type, params, context = {}) {
    const actionType = this._types.get(type);
    if (!actionType) {
      return { success: false, error: `Unknown action type: ${type}` };
    }

    // Validate
    const validation = this.validate(type, params);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.join('; ')}` };
    }

    // Resolve templates
    const resolvedParams = resolveParams(params, context);

    try {
      const result = await actionType.execute(resolvedParams, context);
      this._logExecution(type, resolvedParams, result);
      return result;
    } catch (err) {
      const result = { success: false, error: err.message };
      this._logExecution(type, resolvedParams, result);
      return result;
    }
  }

  /**
   * Log action execution to action-executions.jsonl.
   */
  _logExecution(type, params, result) {
    try {
      const logDir = path.join(os.homedir(), '.config', 'robos', 'event-log');
      fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, 'action-executions.jsonl');
      const entry = {
        ts: new Date().toISOString(),
        type,
        params,
        success: result.success,
        error: result.error || undefined,
      };
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (_) {
      // Non-critical: don't fail action because of logging
    }
  }

  /**
   * Load built-in action types.
   */
  loadBuiltins() {
    const actionsDir = path.join(__dirname, 'actions');
    const files = fs.readdirSync(actionsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const actionDef = require(path.join(actionsDir, file));
      this.register(actionDef);
    }
  }

  /**
   * Load plugin action types from ~/.config/robos/action-plugins/.
   */
  loadPlugins() {
    const pluginDir = path.join(os.homedir(), '.config', 'robos', 'action-plugins');
    if (!fs.existsSync(pluginDir)) return;

    const entries = fs.readdirSync(pluginDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const pluginPath = path.join(pluginDir, entry.name);
        const actionDef = require(pluginPath);
        if (actionDef.type) {
          this.register(actionDef);
        }
      } catch (_) {
        // Skip invalid plugins
      }
    }
  }
}

module.exports = { ActionRegistry, resolveTemplate, resolveParams };
