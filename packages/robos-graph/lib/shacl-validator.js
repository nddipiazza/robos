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
  {
    shapeId: 'urn:robos:shape:FlowDiagramShape',
    targetClass: 'robos:FlowDiagram',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Flow Diagram must have a title.' },
      { path: 'dcterms:description', minCount: 1, message: 'Flow Diagram must have a description.' },
      { path: 'robos:mermaidText', minCount: 1, message: 'Flow Diagram must contain raw Mermaid graph syntax (robos:mermaidText).' },
      { path: 'robos:imagePath', minCount: 1, message: 'Flow Diagram must specify relative path to AI-rendered image (robos:imagePath).' },
      { path: 'robos:tooltip', minCount: 1, message: 'Flow Diagram must declare hover tooltip text (robos:tooltip).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DocumentationPageShape',
    targetClass: 'robos:DocumentationPage',
    targetClasses: ['robos:DocumentationPage', 'robos:DocArticle'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Documentation Page must have a title.' },
      { path: 'robos:slug', minCount: 1, message: 'Documentation Page must declare a URL slug.' },
      { path: 'robos:docPath', minCount: 1, message: 'Documentation Page must specify a relative markdown document path.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ArchitectureDecisionRecordShape',
    targetClass: 'robos:ArchitectureDecisionRecord',
    targetClasses: ['robos:ArchitectureDecisionRecord', 'robos:ADR'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Architecture Decision Record must have a title.' },
      { path: 'robos:status', minCount: 1, message: 'Architecture Decision Record must declare status (proposed, accepted, superseded, etc.).' },
      { path: 'robos:context', minCount: 1, message: 'Architecture Decision Record must provide architectural context and problem statement.' },
      { path: 'robos:decision', minCount: 1, message: 'Architecture Decision Record must state the architectural decision.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:InteractiveWalkthroughShape',
    targetClass: 'robos:InteractiveWalkthrough',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Interactive Walkthrough must have a title.' },
      { path: 'robos:slug', minCount: 1, message: 'Interactive Walkthrough must declare a unique slug.' },
      { path: 'robos:targetApp', minCount: 1, message: 'Interactive Walkthrough must link to a target RobOS application or component.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:CodeSnippetShape',
    targetClass: 'robos:CodeSnippet',
    targetClasses: ['robos:CodeSnippet', 'robos:CodeSample'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Code Snippet must have a title.' },
      { path: 'robos:language', minCount: 1, message: 'Code Snippet must specify a programming language.' },
      { path: 'robos:code', minCount: 1, message: 'Code Snippet must provide source code text.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DatabaseShape',
    targetClass: 'robos:Database',
    targetClasses: ['robos:Database', 'robos:RelationalDatabase'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Database must have a title or display name.' },
      { path: 'robos:engine', minCount: 1, message: 'Database must declare its engine (postgresql, mysql, sqlite, oracle, etc.).' },
      { path: 'robos:databaseName', minCount: 1, message: 'Database must specify a logical database name.' },
      { path: 'robos:host', minCount: 1, message: 'Database must specify a host address or service DNS.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:NoSQLDatabaseShape',
    targetClass: 'robos:NoSQLDatabase',
    targetClasses: ['robos:NoSQLDatabase', 'robos:CacheStore', 'robos:DocumentStore', 'robos:KeyValueStore'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'NoSQL Database must have a title or display name.' },
      { path: 'robos:engine', minCount: 1, message: 'NoSQL Database must declare engine (redis, mongodb, cassandra, dynamodb, elasticsearch).' },
      { path: 'robos:host', minCount: 1, message: 'NoSQL Database must specify a host address or cluster endpoint.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MessageBrokerShape',
    targetClass: 'robos:MessageBroker',
    targetClasses: ['robos:MessageBroker', 'robos:EventBus'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Message Broker must have a title or display name.' },
      { path: 'robos:brokerType', minCount: 1, message: 'Message Broker must declare broker type (kafka, rabbitmq, sqs, nats, pulsar).' },
      { path: 'robos:endpoint', minCount: 1, message: 'Message Broker must specify bootstrap endpoint URI.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MCPServerShape',
    targetClass: 'robos:MCPServer',
    targetClasses: ['robos:MCPServer', 'robos:ToolProvider'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'MCP Server must have a title or display name.' },
      { path: 'robos:transport', minCount: 1, message: 'MCP Server must declare transport protocol (stdio, sse).' },
      { path: 'robos:toolsProvided', minCount: 1, message: 'MCP Server must list at least one provided tool.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:AgentPersonaShape',
    targetClass: 'robos:AgentPersona',
    targetClasses: ['robos:AgentPersona', 'robos:AIAgent'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Agent Persona must have a title or name.' },
      { path: 'robos:role', minCount: 1, message: 'Agent Persona must specify an autonomous role.' },
      { path: 'robos:systemPrompt', minCount: 1, message: 'Agent Persona must provide a system prompt or core directive.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:KubernetesClusterShape',
    targetClass: 'robos:KubernetesCluster',
    targetClasses: ['robos:KubernetesCluster', 'robos:K8sCluster'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Kubernetes Cluster must have a title or display name.' },
      { path: 'robos:provider', minCount: 1, message: 'Kubernetes Cluster must declare provider (eks, gke, aks, minikube, k3s, on-prem).' },
      { path: 'robos:apiEndpoint', minCount: 1, message: 'Kubernetes Cluster must specify API server endpoint URL.' },
      { path: 'robos:clusterContext', minCount: 1, message: 'Kubernetes Cluster must specify kubeconfig context name.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:EnvironmentShape',
    targetClass: 'robos:Environment',
    targetClasses: ['robos:Environment', 'robos:DeploymentEnvironment'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Environment must have a title.' },
      { path: 'robos:environmentType', minCount: 1, message: 'Environment must declare environment type (production, staging, development, test, sandbox).' },
      { path: 'robos:tier', minCount: 1, message: 'Environment must declare SLA/criticality tier.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:GitOpsDeploymentShape',
    targetClass: 'robos:GitOpsDeployment',
    targetClasses: ['robos:GitOpsDeployment', 'robos:ArgoCDApplication'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'GitOps Deployment must have a title.' },
      { path: 'robos:gitopsEngine', minCount: 1, message: 'GitOps Deployment must declare engine (argocd, flux).' },
      { path: 'robos:sourceRepo', minCount: 1, message: 'GitOps Deployment must specify source Git repository.' },
      { path: 'robos:targetCluster', minCount: 1, message: 'GitOps Deployment must link to target Kubernetes Cluster.' },
      { path: 'robos:targetNamespace', minCount: 1, message: 'GitOps Deployment must specify target namespace.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ProtobufContractShape',
    targetClass: 'robos:ProtobufContract',
    targetClasses: ['robos:ProtobufContract', 'robos:GRPCContract'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Protobuf Contract must have a title.' },
      { path: 'robos:specFile', minCount: 1, message: 'Protobuf Contract must specify .proto file path.' },
      { path: 'robos:packageName', minCount: 1, message: 'Protobuf Contract must specify protobuf package name.' },
      { path: 'robos:rpcMethods', minCount: 1, message: 'Protobuf Contract must declare RPC methods.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:GraphQLContractShape',
    targetClass: 'robos:GraphQLContract',
    targetClasses: ['robos:GraphQLContract', 'robos:GraphQLSchema'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'GraphQL Contract must have a title.' },
      { path: 'robos:specFile', minCount: 1, message: 'GraphQL Contract must specify schema file path (.graphql).' },
      { path: 'robos:schemaType', minCount: 1, message: 'GraphQL Contract must declare schema type (federated-subgraph, monolithic, gateway).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:CICDPipelineShape',
    targetClass: 'robos:CICDPipeline',
    targetClasses: ['robos:CICDPipeline', 'robos:Pipeline'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'CI/CD Pipeline must have a title.' },
      { path: 'robos:platform', minCount: 1, message: 'CI/CD Pipeline must declare platform (github-actions, gitlab-ci, jenkins).' },
      { path: 'robos:workflowFile', minCount: 1, message: 'CI/CD Pipeline must specify workflow file path (.github/workflows/...).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:TaskServerShape',
    targetClass: 'robos:TaskServer',
    targetClasses: ['robos:TaskServer'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Task Server must have a title or display name.' },
      { path: 'robos:serverType', minCount: 1, message: 'Task Server must declare server type (jira, github).' },
      { path: 'robos:url', minCount: 1, message: 'Task Server must specify server URL.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ContextSourceShape',
    targetClass: 'robos:ContextSource',
    targetClasses: ['robos:ContextSource'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Context Source must have a title.' },
      { path: 'robos:sourceType', minCount: 1, message: 'Context Source must declare source type (file, folder, url, github, repo, ticket).' },
      { path: 'robos:location', minCount: 1, message: 'Context Source must specify location path, URL, or repository identifier.' },
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
          const count = val === undefined || val === null || (typeof val === 'string' && val.trim() === '') ? 0 : Array.isArray(val) ? val.length : 1;

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
