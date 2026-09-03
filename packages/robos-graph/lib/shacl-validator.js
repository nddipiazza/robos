'use strict';

const BUILTIN_SHACL_SHAPES = [
  {
    shapeId: 'urn:robos:shape:MicroserviceShape',
    targetClass: 'robos:Microservice',
    properties: [
      { path: 'robos:repository', minCount: 1, maxCount: 1, message: 'Microservice must define exactly one repository.' },
      { path: 'robos:ownerTeam', minCount: 1, message: 'Microservice must define an owner team.' },
      { path: 'dcterms:title', minCount: 1, message: 'Microservice must have a title.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ContractShape',
    targetClass: 'robos:Contract',
    properties: [
      { path: 'robos:specFile', minCount: 1, message: 'Contract must specify a specification file path.' },
      { path: 'robos:protocol', minCount: 1, message: 'Contract must declare a protocol (OpenAPI, Pact, etc.).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:RequirementShape',
    targetClass: 'oslc_rm:Requirement',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Requirement must have a title.' },
      { path: 'robos:featureFile', minCount: 1, message: 'Requirement must link to a Gherkin .feature file.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:TeamShape',
    targetClass: 'robos:Team',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Team must have a display name.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ProjectShape',
    targetClass: 'robos:Project',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Project must have a title / name.' },
      { path: 'robos:status', minCount: 1, message: 'Project must declare a lifecycle status.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:EpicShape',
    targetClass: 'robos:Epic',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Epic must have a title.' },
    ],
  },
];

class SHACLValidator {
  constructor(shapes = BUILTIN_SHACL_SHAPES) {
    this.shapes = shapes;
  }

  validateGraph(parser) {
    const results = [];

    for (const node of parser.nodes) {
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      
      for (const shape of this.shapes) {
        const matchesClass = types.some(t => t === shape.targetClass || t.endsWith(`:${shape.targetClass}`));
        if (!matchesClass) continue;

        for (const propRule of shape.properties) {
          const val = node[propRule.path];
          const count = val === undefined || val === null ? 0 : Array.isArray(val) ? val.length : 1;

          if (propRule.minCount && count < propRule.minCount) {
            results.push({
              focusNode: node['@id'],
              shapeId: shape.shapeId,
              resultPath: propRule.path,
              severity: 'sh:Violation',
              resultMessage: propRule.message || `Property ${propRule.path} violates minCount ${propRule.minCount}`,
            });
          }

          if (propRule.maxCount && count > propRule.maxCount) {
            results.push({
              focusNode: node['@id'],
              shapeId: shape.shapeId,
              resultPath: propRule.path,
              severity: 'sh:Violation',
              resultMessage: propRule.message || `Property ${propRule.path} exceeds maxCount ${propRule.maxCount}`,
            });
          }
        }
      }
    }

    return {
      conforms: results.length === 0,
      shapesEvaluated: this.shapes.length,
      nodesEvaluated: parser.nodes.length,
      resultsCount: results.length,
      results,
    };
  }
}

module.exports = { SHACLValidator, BUILTIN_SHACL_SHAPES };
