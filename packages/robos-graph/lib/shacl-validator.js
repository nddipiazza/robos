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
  {
    shapeId: 'urn:robos:shape:ELearningShape',
    targetClass: 'robos:ELearning',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'eLearning course must have a title.' },
      { path: 'robos:topic', minCount: 1, message: 'eLearning course must specify a topic domain.' },
      { path: 'robos:modules', minCount: 1, message: 'eLearning course must have at least one learning module.' },
      { path: 'robos:gitopsFile', minCount: 1, message: 'eLearning course must declare its GitOps file location (.robos/elearning.yaml).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DesktopAppShape',
    targetClass: 'robos:DesktopApp',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Desktop App must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'Desktop App must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'Desktop App must specify technology stack.' },
      { path: 'robos:desktopFramework', minCount: 1, message: 'Desktop App must declare desktop framework (Electron, Tauri, Qt, GTK).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ConsoleAppShape',
    targetClass: 'robos:ConsoleApp',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Console App must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'Console App must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'Console App must specify technology stack.' },
      { path: 'robos:cliCommand', minCount: 1, message: 'Console App must declare executable CLI command name.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MobileAppShape',
    targetClass: 'robos:MobileApp',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Mobile App must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'Mobile App must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'Mobile App must specify technology stack.' },
      { path: 'robos:platform', minCount: 1, message: 'Mobile App must specify mobile platform(s).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DataPipelineShape',
    targetClass: 'robos:DataPipeline',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Data Pipeline must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'Data Pipeline must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'Data Pipeline must specify technology stack.' },
      { path: 'robos:pipelineEngine', minCount: 1, message: 'Data Pipeline must declare execution engine (Kafka Streams, Spark, Celery).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:LibraryShape',
    targetClass: 'robos:Library',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Library must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'Library must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'Library must specify technology stack.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:FrontEndAppShape',
    targetClass: 'robos:FrontEndApp',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Front End App must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'Front End App must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'Front End App must specify technology stack.' },
      { path: 'robos:frontendFramework', minCount: 1, message: 'Front End App must declare frontend framework (React, Vue, Next.js, Angular, Svelte).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:PCGameShape',
    targetClass: 'robos:PCGame',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'PC Game must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'PC Game must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'PC Game must specify technology stack.' },
      { path: 'robos:gameEngine', minCount: 1, message: 'PC Game must specify game engine (Unreal Engine, Unity, Godot, Bevy).' },
      { path: 'robos:targetPlatform', minCount: 1, message: 'PC Game must specify target PC platform(s) (Windows, Linux, macOS).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MobileGameShape',
    targetClass: 'robos:MobileGame',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Mobile Game must have a title.' },
      { path: 'robos:repository', minCount: 1, message: 'Mobile Game must define a repository.' },
      { path: 'robos:technology', minCount: 1, message: 'Mobile Game must specify technology stack.' },
      { path: 'robos:gameEngine', minCount: 1, message: 'Mobile Game must specify game engine (Unity, Unreal Engine, Godot).' },
      { path: 'robos:platform', minCount: 1, message: 'Mobile Game must specify mobile platform(s) (iOS, Android).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:GitProjectOrganizationShape',
    targetClass: 'robos:GitProjectOrganization',
    targetClasses: ['robos:GitProjectOrganization', 'robos:GitOrganization'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Git Project Organization must have a title or display name.' },
      { path: 'robos:url', minCount: 1, message: 'Git Project Organization must specify forge URL (e.g. https://github.com/apache).' },
      { path: 'robos:orgName', minCount: 1, message: 'Git Project Organization must specify organization handle/slug.' },
      { path: 'robos:forgeType', minCount: 1, message: 'Git Project Organization must declare forge type (github, gitlab, bitbucket, etc.).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:RemoteExecutionClusterShape',
    targetClass: 'robos:RemoteExecutionCluster',
    targetClasses: ['robos:RemoteExecutionCluster', 'robos:RemoteBuildCluster'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Remote Execution Cluster must have a title.' },
      { path: 'robos:protocol', minCount: 1, message: 'Remote Execution Cluster must declare protocol standard (e.g. REAPI_v2).' },
      { path: 'robos:provider', minCount: 1, message: 'Remote Execution Cluster must declare backend provider engine (e.g. buildbarn, nativelink, buildgrid).' },
      { path: 'robos:executionEndpoint', minCount: 1, message: 'Remote Execution Cluster must specify execution endpoint URI.' },
      { path: 'robos:casEndpoint', minCount: 1, message: 'Remote Execution Cluster must specify Content Addressable Storage (CAS) endpoint URI.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:BuildSystemShape',
    targetClass: 'robos:BuildSystem',
    targetClasses: ['robos:BuildSystem', 'robos:MonorepoBuild'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Build System must have a title.' },
      { path: 'robos:buildTool', minCount: 1, message: 'Build System must declare build tool (bazel, buck2, pants, please).' },
      { path: 'robos:configFile', minCount: 1, message: 'Build System must specify configuration file (.bazelrc, .buckconfig).' },
    ],
  },
];

class SHACLValidator {
  constructor(shapes = BUILTIN_SHACL_SHAPES) {
    this.shapes = shapes;
  }

  validate(target) {
    if (!target) return { conforms: true, shapesEvaluated: this.shapes.length, nodesEvaluated: 0, resultsCount: 0, results: [] };
    if (target.nodes && Array.isArray(target.nodes)) {
      return this.validateGraph(target);
    }
    const nodes = Array.isArray(target) ? target : [target];
    return this.validateGraph({ nodes });
  }

  validateGraph(parser) {
    const results = [];

    for (const node of parser.nodes) {
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      
      for (const shape of this.shapes) {
        const matchesClass = types.some(t => 
          t === shape.targetClass || 
          t.endsWith(`:${shape.targetClass}`) ||
          (Array.isArray(shape.targetClasses) && shape.targetClasses.some(tc => t === tc || t.endsWith(`:${tc}`)))
        );
        if (!matchesClass) continue;

        for (const propRule of shape.properties) {
          const val = node[propRule.path];
          const count = val === undefined || val === null ? 0 : Array.isArray(val) ? val.length : 1;

          if (propRule.minCount && count < propRule.minCount) {
            results.push({
              focusNode: node['@id'],
              shapeId: shape.shapeId,
              resultPath: propRule.path,
              path: propRule.path,
              severity: 'sh:Violation',
              resultMessage: propRule.message || `Property ${propRule.path} violates minCount ${propRule.minCount}`,
            });
          }

          if (propRule.maxCount && count > propRule.maxCount) {
            results.push({
              focusNode: node['@id'],
              shapeId: shape.shapeId,
              resultPath: propRule.path,
              path: propRule.path,
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
      violations: results,
    };
  }
}

module.exports = { SHACLValidator, BUILTIN_SHACL_SHAPES };
