'use strict';
const fs = require('fs');
const path = require('path');

class GitOpsSDLCParser {
  constructor(schemasDir) {
    this.schemasDir = schemasDir || path.join(__dirname, 'schemas');
    this.schemas = {
      topology: this._loadSchema('topology.schema.json'),
      teams: this._loadSchema('teams.schema.json'),
      packages: this._loadSchema('packages.schema.json'),
      projects: this._loadSchema('projects.schema.json'),
    };
  }

  _loadSchema(filename) {
    try {
      const fullPath = path.join(this.schemasDir, filename);
      if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      }
    } catch {}
    return null;
  }

  _validateAgainstSchema(data, schema, schemaName) {
    const errors = [];
    if (!data || typeof data !== 'object') {
      errors.push({ file: schemaName, message: 'Root document must be an object' });
      return { valid: false, errors };
    }

    if (schema && schema.required) {
      for (const req of schema.required) {
        if (data[req] === undefined) {
          errors.push({ file: schemaName, message: `Missing required root property '${req}'` });
        }
      }
    }

    if (schemaName === 'topology.yaml' && Array.isArray(data.nodes)) {
      data.nodes.forEach((node, idx) => {
        if (!node.id || !node.name || !node.type) {
          errors.push({ file: schemaName, message: `Node at index ${idx} missing required fields (id, name, type)` });
        }
      });
    }

    if (schemaName === 'teams.yaml' && Array.isArray(data.teams)) {
      data.teams.forEach((team, idx) => {
        if (!team.id || !team.name || !team.topology || !Array.isArray(team.members)) {
          errors.push({ file: schemaName, message: `Team at index ${idx} missing required fields (id, name, topology, members)` });
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateTopology(data) {
    return this._validateAgainstSchema(data, this.schemas.topology, 'topology.yaml');
  }

  validateTeams(data) {
    return this._validateAgainstSchema(data, this.schemas.teams, 'teams.yaml');
  }

  validatePackages(data) {
    return this._validateAgainstSchema(data, this.schemas.packages, 'packages.yaml');
  }

  validateProjects(data) {
    return this._validateAgainstSchema(data, this.schemas.projects, 'projects.yaml');
  }

  _parseFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    }
    // Lightweight YAML parser for standard key-values and arrays
    try {
      // Simple parse for JSON-compatible or structured text
      return JSON.parse(content);
    } catch {
      // Basic key-value YAML reader fallback
      return this._fallbackYamlParse(content);
    }
  }

  _fallbackYamlParse(yamlText) {
    // Basic fallback parsing for mock YAML files
    const lines = yamlText.split('\n');
    const result = {};
    let currentKey = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (m) {
        currentKey = m[1];
        let val = m[2].replace(/^["']|["']$/g, '').trim();
        if (val === '') {
          result[currentKey] = [];
        } else {
          result[currentKey] = val;
        }
      }
    }
    return result;
  }

  loadSDLC(robosDir) {
    const dir = robosDir.endsWith('.robos') ? robosDir : path.join(robosDir, '.robos');
    const allErrors = [];

    const topologyFile = fs.existsSync(path.join(dir, 'topology.json')) ? path.join(dir, 'topology.json') : path.join(dir, 'topology.yaml');
    const teamsFile = fs.existsSync(path.join(dir, 'teams.json')) ? path.join(dir, 'teams.json') : path.join(dir, 'teams.yaml');
    const packagesFile = fs.existsSync(path.join(dir, 'packages.json')) ? path.join(dir, 'packages.json') : path.join(dir, 'packages.yaml');
    const projectsFile = fs.existsSync(path.join(dir, 'projects.json')) ? path.join(dir, 'projects.json') : path.join(dir, 'projects.yaml');

    const topology = this._parseFile(topologyFile);
    const teams = this._parseFile(teamsFile);
    const packages = this._parseFile(packagesFile);
    const projects = this._parseFile(projectsFile);

    if (topology) {
      const res = this.validateTopology(topology);
      allErrors.push(...res.errors);
    } else {
      allErrors.push({ file: 'topology.yaml', message: 'File not found' });
    }

    if (teams) {
      const res = this.validateTeams(teams);
      allErrors.push(...res.errors);
    } else {
      allErrors.push({ file: 'teams.yaml', message: 'File not found' });
    }

    if (packages) {
      const res = this.validatePackages(packages);
      allErrors.push(...res.errors);
    }

    if (projects) {
      const res = this.validateProjects(projects);
      allErrors.push(...res.errors);
    }

    return {
      valid: allErrors.length === 0,
      dir,
      topology,
      teams,
      packages,
      projects,
      errors: allErrors,
    };
  }

  initSDLCDirectory(targetDir) {
    const dir = targetDir.endsWith('.robos') ? targetDir : path.join(targetDir, '.robos');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'entities'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'contracts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });

    const topologyTmpl = {
      version: '1.0',
      kind: 'Topology',
      system: {
        id: 'buildbarn-platform',
        name: 'BuildBarn Platform',
        description: 'Distributed form processing and workflow orchestration system',
      },
      nodes: [
        { id: 'web-client', name: 'Web Portal', type: 'frontend', technology: 'React / Vite', repo: 'github.com/acme/buildbarn-web' },
        { id: 'forms-api', name: 'Forms API Service', type: 'service', technology: 'Node.js / Express', repo: 'github.com/acme/buildbarn-forms', contracts: ['contracts/forms-api.openapi.yaml'], entities: ['entities/form.typespec'] },
        { id: 'db-primary', name: 'PostgreSQL Database', type: 'database', technology: 'PostgreSQL 16' },
      ],
      links: [
        { from: 'web-client', to: 'forms-api', protocol: 'HTTPS / REST', contract: 'contracts/forms-api.openapi.yaml' },
        { from: 'forms-api', to: 'db-primary', protocol: 'TCP / SQL' },
      ],
    };

    const teamsTmpl = {
      version: '1.0',
      kind: 'TeamRoster',
      teams: [
        {
          id: 'core-platform',
          name: 'Core Platform Team',
          topology: 'platform',
          members: [
            { id: 'user-ndipiazza', name: 'Lead Architect', type: 'human', role: 'Reviewer & Approver' },
            { id: 'agent-gemini-planner', name: 'Gemini Strategic Planner', type: 'agent', model: 'gemini-2.5-pro', role: 'Architecture Planning', skills: ['create-feature-spec'] },
            { id: 'agent-claude-coder', name: 'Claude Code Executor', type: 'agent', model: 'claude-3.7-sonnet', role: 'Implementation', skills: ['e2e-driven-dev'] },
          ],
        },
      ],
    };

    const packagesTmpl = {
      version: '1.0',
      kind: 'Packages',
      packages: [
        { id: 'dev-central', name: 'Dev Central', type: 'desktop-app', runtime: 'Electron 30', entry: 'packages/dev-central/main.js' },
        { id: 'robos-graph', name: 'SDLC Knowledge Graph', type: 'desktop-app', runtime: 'Electron 30', entry: 'packages/robos-graph/main.js' },
      ],
    };

    const projectsTmpl = {
      version: '1.0',
      kind: 'Projects',
      projects: [
        {
          id: 'robos-platform',
          name: 'RobOS Platform Repository',
          repos: [
            { id: 'robos', url: 'github.com/nddipiazza/robos', defaultBranch: 'main', path: '.' },
          ],
        },
      ],
    };

    fs.writeFileSync(path.join(dir, 'topology.json'), JSON.stringify(topologyTmpl, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'teams.json'), JSON.stringify(teamsTmpl, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'packages.json'), JSON.stringify(packagesTmpl, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'projects.json'), JSON.stringify(projectsTmpl, null, 2), 'utf8');

    return {
      ok: true,
      dir,
      filesCreated: ['topology.json', 'teams.json', 'packages.json', 'projects.json'],
    };
  }
}

module.exports = { GitOpsSDLCParser };
