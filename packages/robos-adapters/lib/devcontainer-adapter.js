'use strict';

/**
 * Devcontainer Adapter
 * Ingests and generates standard .devcontainer/devcontainer.json files
 */
class DevcontainerAdapter {
  constructor() {
    this.name = 'devcontainer';
    this.standard = 'Development Containers Specification (containers.dev)';
  }

  parseConfig(jsonContent) {
    let cfg = {};
    try {
      cfg = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    } catch {
      cfg = {};
    }

    return {
      ok: true,
      name: cfg.name || 'RobOS Devcontainer',
      image: cfg.image || 'mcr.microsoft.com/devcontainers/base:ubuntu-22.04',
      forwardPorts: cfg.forwardPorts || [3000, 5432, 9092],
      featuresCount: Object.keys(cfg.features || {}).length,
      features: cfg.features || {},
      remoteUser: cfg.remoteUser || 'vscode',
    };
  }

  generateConfig(serviceInfo) {
    return {
      name: serviceInfo.name || 'Microservice Runtime',
      image: 'mcr.microsoft.com/devcontainers/typescript-node:20-bullseye',
      forwardPorts: [serviceInfo.port || 3000],
      features: {
        'ghcr.io/devcontainers/features/docker-in-docker:2': {},
        'ghcr.io/devcontainers/features/git:1': {},
      },
      postCreateCommand: 'npm install',
      remoteUser: 'node',
    };
  }
}

module.exports = { DevcontainerAdapter };
