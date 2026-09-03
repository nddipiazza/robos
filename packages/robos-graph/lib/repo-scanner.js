'use strict';
const path = require('path');
const fs = require('fs');

class RepoScanner {
  scanDirectory(dirPath) {
    const nodes = [];
    if (!fs.existsSync(dirPath)) {
      return { dirPath, nodes, count: 0 };
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const pkgJsonPath = path.join(fullPath, 'package.json');
        const goModPath = path.join(fullPath, 'go.mod');
        const pomXmlPath = path.join(fullPath, 'pom.xml');

        if (fs.existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            const serviceSlug = pkg.name ? pkg.name.replace(/^@.*\//, '') : entry.name;
            nodes.push({
              '@id': `urn:robos:service:${serviceSlug}`,
              '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
              'dcterms:title': pkg.description || `${serviceSlug} Service`,
              'robos:repository': `local/${entry.name}`,
              'robos:technology': 'Node.js',
              'robos:ownerTeam': 'urn:robos:team:core-platform',
            });
          } catch {}
        } else if (fs.existsSync(goModPath)) {
          nodes.push({
            '@id': `urn:robos:service:${entry.name}`,
            '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
            'dcterms:title': `${entry.name} Go Service`,
            'robos:repository': `local/${entry.name}`,
            'robos:technology': 'Go',
            'robos:ownerTeam': 'urn:robos:team:core-platform',
          });
        } else if (fs.existsSync(pomXmlPath)) {
          nodes.push({
            '@id': `urn:robos:service:${entry.name}`,
            '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
            'dcterms:title': `${entry.name} Spring Boot Service`,
            'robos:repository': `local/${entry.name}`,
            'robos:technology': 'Java / Spring',
            'robos:ownerTeam': 'urn:robos:team:core-platform',
          });
        }
      }
    }

    return {
      dirPath,
      nodes,
      count: nodes.length,
    };
  }
}

module.exports = { RepoScanner };
