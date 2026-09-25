---
name: generate-app-docs
description: Inspect an application or project's latest Knowledge Graph existence, synthesize living Markdown architecture documentation and Mermaid FlowDiagram, and link them to the KGraph documentation package.
---

# Generate Living Documentation & Architecture Flow Diagrams

Inspect an application's latest state in the RobOS Knowledge Graph, synthesize living Markdown architecture documentation (`docs/applications/<app-slug>.md` or `docs/services/<service-slug>.md`), generate a Mermaid FlowDiagram (`robos:FlowDiagram`), and register them under the `documentation` package (`robos.docs`).

## When to Use

Use this skill whenever:
- An application or service changes its contracts, dependencies, or architectural topology.
- Synchronizing living documentation pages with the Dual-State Knowledge Graph.
- Creating visual Mermaid sequence or component interaction diagrams.

## Programmatic Usage

```javascript
const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');
const store = new SDLCKnowledgeGraphStore();

const result = store.generateAppDocumentation({
  appId: 'urn:robos:service:forms-api'
});
console.log('Created doc page:', result.docPage['robos:docPath']);
console.log('Created FlowDiagram:', result.flowDiagram['@id']);
```
