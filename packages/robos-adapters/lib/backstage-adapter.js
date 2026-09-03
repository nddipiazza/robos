'use strict';

/**
 * Backstage Adapter
 * Bi-directional translation between Spotify Backstage catalog-info.yaml and RobOS .robos/topology.yaml
 */
class BackstageAdapter {
  constructor() {
    this.name = 'backstage';
    this.standard = 'Spotify Backstage Catalog (v1alpha1)';
  }

  importCatalog(catalogEntities) {
    if (!Array.isArray(catalogEntities)) {
      catalogEntities = [catalogEntities];
    }

    const services = [];
    const domains = [];
    const apis = [];

    for (const entity of catalogEntities) {
      if (!entity || !entity.kind) continue;
      const meta = entity.metadata || {};
      const spec = entity.spec || {};

      switch (entity.kind.toLowerCase()) {
        case 'component':
          services.push({
            id: meta.name,
            name: meta.title || meta.name,
            type: spec.type || 'service',
            owner: spec.owner || 'team-core',
            system: spec.system || 'default-system',
            description: meta.description || '',
            tags: meta.tags || [],
            lifecycle: spec.lifecycle || 'production',
          });
          break;
        case 'domain':
        case 'system':
          domains.push({
            id: meta.name,
            name: meta.title || meta.name,
            description: meta.description || '',
            owner: spec.owner || 'engineering',
          });
          break;
        case 'api':
          apis.push({
            id: meta.name,
            type: spec.type || 'openapi',
            lifecycle: spec.lifecycle || 'production',
            owner: spec.owner || 'team-core',
            definition: spec.definition || '',
          });
          break;
      }
    }

    return {
      version: '1.0.0',
      topology: {
        services,
        domains,
        apis,
      },
    };
  }

  exportCatalog(robosTopology) {
    const topo = robosTopology.topology || robosTopology;
    const services = topo.services || [];
    const entities = [];

    for (const svc of services) {
      entities.push({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: svc.id,
          title: svc.name,
          description: svc.description || '',
          tags: svc.tags || ['robos', 'microservice'],
          annotations: {
            'robos.dev/managed-by': 'agent-first-os',
          },
        },
        spec: {
          type: svc.type || 'service',
          lifecycle: svc.lifecycle || 'production',
          owner: svc.owner || 'team-core',
          system: svc.system || 'buildbarn-platform',
        },
      });
    }

    return entities;
  }
}

module.exports = { BackstageAdapter };
