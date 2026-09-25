---
name: generate-app-elearning
description: Inspect an application or project's latest Knowledge Graph existence, synthesize an interactive eLearning course curriculum, scaffold the standalone Electron eLearning app, and issue verified completion certificates.
---

# Generate Application-Attached eLearning & Scaffolding

Inspect an application's latest state in the RobOS Knowledge Graph (`robos-graph`), synthesize a tailored interactive course curriculum (`robos:ELearning`), link it via `robos:hasELearning`, scaffold a standalone Electron eLearning desktop app, and record verifiable Certificates of Completion (`robos:CertificateOfCompletion`).

## When to Use

Use this skill whenever:
- A developer, architect, or AI agent requests interactive training, tutorials, or masterclasses for an application or project.
- A new application or service archetype (`robos:Microservice`, `robos:FrontEndApp`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:PCGame`, etc.) is added to the Knowledge Graph.
- Generating a verifiable Certificate of Completion upon passing quizzes and hands-on lab exercises.

## Programmatic Usage

```javascript
const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');
const store = new SDLCKnowledgeGraphStore();

// 1. Synthesize course and scaffold standalone Electron app
const result = store.generateAppELearning({
  appId: 'urn:robos:service:forms-api', // or slug: 'forms-api'
  difficulty: 'Intermediate',
  scaffoldApp: true
});
console.log('Synthesized course:', result.course['dcterms:title']);
console.log('App scaffolded at:', result.scaffoldedAppPath);

// 2. Award Certificate of Completion
const certResult = store.issueCertificateOfCompletion({
  appId: 'urn:robos:service:forms-api',
  userId: 'robos',
  scorePercentage: 100
});
console.log('Certificate hash:', certResult.certificate['robos:verificationHash']);
```

## CLI Usage

```bash
# Launch interactive eLearning app
electron packages/forms-api-elearning

# Launch central eLearning player
electron packages/robos-elearning --app=forms-api
```
