/**
 * Schema Validator — validates known config file types.
 */
'use strict';

const SCHEMAS = {
  'workflows/*.yaml': validateWorkflowYaml,
  'workflows/*.json': validateWorkflowJson,
  'task-servers.json': validateTaskServers,
  'settings.json': validateSettings,
};

class SchemaValidator {
  hasSchema(key) {
    return !!this._findValidator(key);
  }

  validate(key, content) {
    const validator = this._findValidator(key);
    if (!validator) return [];
    try {
      return validator(content);
    } catch (e) {
      return [`Validation error: ${e.message}`];
    }
  }

  _findValidator(key) {
    // Exact match
    if (SCHEMAS[key]) return SCHEMAS[key];
    // Glob match
    for (const [pattern, validator] of Object.entries(SCHEMAS)) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]+') + '$');
        if (regex.test(key)) return validator;
      }
    }
    return null;
  }
}

function validateWorkflowJson(content) {
  const errors = [];
  let data;
  try { data = JSON.parse(content); } catch { return ['Invalid JSON']; }

  if (!Array.isArray(data) && typeof data !== 'object') {
    return ['Workflow must be an object or array'];
  }

  const workflows = Array.isArray(data) ? data : [data];
  for (const wf of workflows) {
    if (!wf.id) errors.push('Workflow missing id');
    if (!wf.name) errors.push('Workflow missing name');
    if (!wf.states || !wf.states.length) errors.push(`Workflow ${wf.id || '?'} has no states`);
    if (wf.states) {
      const initials = wf.states.filter(s => s.is_initial);
      if (initials.length === 0) errors.push(`Workflow ${wf.id || '?'} has no initial state`);
    }
  }
  return errors;
}

function validateWorkflowYaml(content) {
  // Basic YAML validation (check it's not empty and has key structure)
  if (!content || !content.trim()) return ['Empty workflow file'];
  if (!content.includes('states') && !content.includes('stages')) {
    return ['Workflow YAML should contain "states" or "stages"'];
  }
  return [];
}

function validateTaskServers(content) {
  const errors = [];
  let data;
  try { data = JSON.parse(content); } catch { return ['Invalid JSON']; }

  if (!Array.isArray(data)) return ['task-servers.json must be an array'];

  for (const server of data) {
    if (!server.id) errors.push('Task server missing id');
    if (!server.type) errors.push(`Task server ${server.id || '?'} missing type`);
    if (!['jira', 'github', 'gitlab', 'linear', 'azure'].includes(server.type)) {
      errors.push(`Task server ${server.id || '?'} has unknown type: ${server.type}`);
    }
  }
  return errors;
}

function validateSettings(content) {
  try { JSON.parse(content); return []; }
  catch { return ['Invalid JSON']; }
}

module.exports = { SchemaValidator, SCHEMAS };
