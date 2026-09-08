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
  {
    shapeId: 'urn:robos:shape:PromptStrategyShape',
    targetClass: 'robos:PromptStrategy',
    targetClasses: ['robos:PromptStrategy', 'robos:PromptOptimizer', 'robos:PromptCompiler', 'robos:AIPromptTechnique'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Prompt Strategy must have a title or display name.' },
      { path: 'robos:strategyType', minCount: 1, message: 'Prompt Strategy must declare strategy type (compression, teleprompter-optimization, few-shot-compilation).' },
      { path: 'robos:engine', minCount: 1, message: 'Prompt Strategy must declare optimization engine (caveman, dspy, standard).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:FeatureShape',
    targetClass: 'robos:Feature',
    targetClasses: ['robos:Feature', 'robos:ProductFeature'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Feature must have a title.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:UserStoryShape',
    targetClass: 'robos:UserStory',
    targetClasses: ['robos:UserStory', 'robos:Story'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'User Story must have a title.' },
      { path: 'robos:status', minCount: 1, message: 'User Story must have a status.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:TaskShape',
    targetClass: 'robos:Task',
    targetClasses: ['robos:Task', 'oslc_cm:ChangeRequest', 'robos:WorkItem'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Task must have a title.' },
      { path: 'robos:status', minCount: 1, message: 'Task must declare a lifecycle status.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:SubtaskShape',
    targetClass: 'robos:Subtask',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Subtask must have a title.' },
      { path: 'robos:parentTask', minCount: 1, message: 'Subtask must link to its parent task.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:BugShape',
    targetClass: 'robos:Bug',
    targetClasses: ['robos:Bug', 'robos:Defect', 'oslc_cm:Defect'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Bug must have a title.' },
      { path: 'robos:severity', minCount: 1, message: 'Bug must declare severity level.' },
      { path: 'robos:status', minCount: 1, message: 'Bug must declare lifecycle status.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:SprintShape',
    targetClass: 'robos:Sprint',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Sprint must have a title or name.' },
      { path: 'robos:status', minCount: 1, message: 'Sprint must declare status (planning, active, completed).' },
      { path: 'robos:startDate', minCount: 1, message: 'Sprint must specify a start date.' },
      { path: 'robos:endDate', minCount: 1, message: 'Sprint must specify an end date.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MilestoneShape',
    targetClass: 'robos:Milestone',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Milestone must have a title.' },
      { path: 'robos:targetDate', minCount: 1, message: 'Milestone must declare a target delivery date.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:GitRepositoryShape',
    targetClass: 'robos:GitRepository',
    targetClasses: ['robos:GitRepository', 'robos:Repository'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Git Repository must have a title.' },
      { path: 'robos:url', minCount: 1, message: 'Git Repository must specify a repository URL.' },
      { path: 'robos:defaultBranch', minCount: 1, message: 'Git Repository must declare its default branch.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:GitBranchShape',
    targetClass: 'robos:GitBranch',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Git Branch must have a title or display name.' },
      { path: 'robos:branchName', minCount: 1, message: 'Git Branch must specify branch name.' },
      { path: 'robos:repository', minCount: 1, message: 'Git Branch must link to parent repository.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:PullRequestShape',
    targetClass: 'robos:PullRequest',
    targetClasses: ['robos:PullRequest', 'robos:MergeRequest'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Pull Request must have a title.' },
      { path: 'robos:prNumber', minCount: 1, message: 'Pull Request must specify PR number.' },
      { path: 'robos:sourceBranch', minCount: 1, message: 'Pull Request must declare source branch.' },
      { path: 'robos:targetBranch', minCount: 1, message: 'Pull Request must declare target branch.' },
      { path: 'robos:status', minCount: 1, message: 'Pull Request must declare status (open, merged, closed).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:GitCommitShape',
    targetClass: 'robos:GitCommit',
    targetClasses: ['robos:GitCommit', 'robos:CommitRef'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Git Commit must have a title or message snippet.' },
      { path: 'robos:commitSha', minCount: 1, message: 'Git Commit must specify commit SHA hash.' },
      { path: 'robos:repository', minCount: 1, message: 'Git Commit must link to parent repository.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:GitTagShape',
    targetClass: 'robos:GitTag',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Git Tag must have a title.' },
      { path: 'robos:tagName', minCount: 1, message: 'Git Tag must specify tag name.' },
      { path: 'robos:commitSha', minCount: 1, message: 'Git Tag must link to target commit SHA.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:APIEndpointShape',
    targetClass: 'robos:APIEndpoint',
    targetClasses: ['robos:APIEndpoint', 'robos:APIOperation'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'API Endpoint must have a title or summary.' },
      { path: 'robos:pathPattern', minCount: 1, message: 'API Endpoint must declare path pattern (e.g. /api/v1/orders).' },
      { path: 'robos:httpMethod', minCount: 1, message: 'API Endpoint must declare HTTP method (GET, POST, etc.).' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DataModelShape',
    targetClass: 'robos:DataModel',
    targetClasses: ['robos:DataModel', 'robos:SchemaModel', 'robos:DomainEntity'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Data Model must have a title.' },
      { path: 'robos:modelName', minCount: 1, message: 'Data Model must specify entity/model name.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DatabaseSchemaShape',
    targetClass: 'robos:DatabaseSchema',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Database Schema must have a title.' },
      { path: 'robos:schemaName', minCount: 1, message: 'Database Schema must specify schema name.' },
      { path: 'robos:database', minCount: 1, message: 'Database Schema must link to parent database.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DatabaseTableShape',
    targetClass: 'robos:DatabaseTable',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Database Table must have a title.' },
      { path: 'robos:tableName', minCount: 1, message: 'Database Table must specify table name.' },
      { path: 'robos:database', minCount: 1, message: 'Database Table must link to parent database.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DatabaseColumnShape',
    targetClass: 'robos:DatabaseColumn',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Database Column must have a title.' },
      { path: 'robos:columnName', minCount: 1, message: 'Database Column must specify column name.' },
      { path: 'robos:dataType', minCount: 1, message: 'Database Column must declare data type.' },
      { path: 'robos:table', minCount: 1, message: 'Database Column must link to parent table.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DatabaseIndexShape',
    targetClass: 'robos:DatabaseIndex',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Database Index must have a title.' },
      { path: 'robos:indexName', minCount: 1, message: 'Database Index must specify index name.' },
      { path: 'robos:table', minCount: 1, message: 'Database Index must link to parent table.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:NoSQLCollectionShape',
    targetClass: 'robos:NoSQLCollection',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'NoSQL Collection must have a title.' },
      { path: 'robos:collectionName', minCount: 1, message: 'NoSQL Collection must specify collection name.' },
      { path: 'robos:database', minCount: 1, message: 'NoSQL Collection must link to parent database.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MessageTopicShape',
    targetClass: 'robos:MessageTopic',
    targetClasses: ['robos:MessageTopic', 'robos:MessageQueue', 'robos:EventTopic'],
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Message Topic must have a title.' },
      { path: 'robos:topicName', minCount: 1, message: 'Message Topic must specify topic name.' },
      { path: 'robos:broker', minCount: 1, message: 'Message Topic must link to parent message broker.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ConsumerGroupShape',
    targetClass: 'robos:ConsumerGroup',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Consumer Group must have a title.' },
      { path: 'robos:groupId', minCount: 1, message: 'Consumer Group must declare consumer group ID.' },
      { path: 'robos:topic', minCount: 1, message: 'Consumer Group must link to subscribed topic.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MCPToolShape',
    targetClass: 'robos:MCPTool',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'MCP Tool must have a title.' },
      { path: 'robos:toolName', minCount: 1, message: 'MCP Tool must declare tool name.' },
      { path: 'robos:mcpServer', minCount: 1, message: 'MCP Tool must link to parent MCP server.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MCPResourceShape',
    targetClass: 'robos:MCPResource',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'MCP Resource must have a title.' },
      { path: 'robos:uriTemplate', minCount: 1, message: 'MCP Resource must declare URI template.' },
      { path: 'robos:mcpServer', minCount: 1, message: 'MCP Resource must link to parent MCP server.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:MCPPromptShape',
    targetClass: 'robos:MCPPrompt',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'MCP Prompt must have a title.' },
      { path: 'robos:promptName', minCount: 1, message: 'MCP Prompt must declare prompt name.' },
      { path: 'robos:mcpServer', minCount: 1, message: 'MCP Prompt must link to parent MCP server.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:KubernetesNamespaceShape',
    targetClass: 'robos:KubernetesNamespace',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Kubernetes Namespace must have a title.' },
      { path: 'robos:namespaceName', minCount: 1, message: 'Kubernetes Namespace must specify namespace name.' },
      { path: 'robos:cluster', minCount: 1, message: 'Kubernetes Namespace must link to parent cluster.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:KubernetesDeploymentShape',
    targetClass: 'robos:KubernetesDeployment',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Kubernetes Deployment must have a title.' },
      { path: 'robos:namespace', minCount: 1, message: 'Kubernetes Deployment must link to target namespace.' },
      { path: 'robos:image', minCount: 1, message: 'Kubernetes Deployment must specify container image.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:KubernetesServiceShape',
    targetClass: 'robos:KubernetesService',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Kubernetes Service must have a title.' },
      { path: 'robos:serviceName', minCount: 1, message: 'Kubernetes Service must specify service name.' },
      { path: 'robos:serviceType', minCount: 1, message: 'Kubernetes Service must declare service type.' },
      { path: 'robos:namespace', minCount: 1, message: 'Kubernetes Service must link to namespace.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:KubernetesIngressShape',
    targetClass: 'robos:KubernetesIngress',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Kubernetes Ingress must have a title.' },
      { path: 'robos:ingressName', minCount: 1, message: 'Kubernetes Ingress must specify ingress name.' },
      { path: 'robos:host', minCount: 1, message: 'Kubernetes Ingress must specify routing hostname.' },
      { path: 'robos:namespace', minCount: 1, message: 'Kubernetes Ingress must link to namespace.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:PipelineStageShape',
    targetClass: 'robos:PipelineStage',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Pipeline Stage must have a title.' },
      { path: 'robos:stageName', minCount: 1, message: 'Pipeline Stage must specify stage name.' },
      { path: 'robos:pipeline', minCount: 1, message: 'Pipeline Stage must link to parent CI/CD pipeline.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:PipelineJobShape',
    targetClass: 'robos:PipelineJob',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Pipeline Job must have a title.' },
      { path: 'robos:jobName', minCount: 1, message: 'Pipeline Job must specify job name.' },
      { path: 'robos:stage', minCount: 1, message: 'Pipeline Job must link to parent pipeline stage.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:PipelineStepShape',
    targetClass: 'robos:PipelineStep',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Pipeline Step must have a title.' },
      { path: 'robos:stepName', minCount: 1, message: 'Pipeline Step must specify step name.' },
      { path: 'robos:job', minCount: 1, message: 'Pipeline Step must link to parent job.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:LearningModuleShape',
    targetClass: 'robos:LearningModule',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Learning Module must have a title.' },
      { path: 'robos:course', minCount: 1, message: 'Learning Module must link to parent eLearning course.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:LearningLessonShape',
    targetClass: 'robos:LearningLesson',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Learning Lesson must have a title.' },
      { path: 'robos:module', minCount: 1, message: 'Learning Lesson must link to parent learning module.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:HandsOnLabShape',
    targetClass: 'robos:HandsOnLab',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Hands-on Lab must have a title.' },
      { path: 'robos:labFile', minCount: 1, message: 'Hands-on Lab must specify lab guide file path.' },
      { path: 'robos:module', minCount: 1, message: 'Hands-on Lab must link to parent learning module.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:QuizAssessmentShape',
    targetClass: 'robos:QuizAssessment',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Quiz Assessment must have a title.' },
      { path: 'robos:module', minCount: 1, message: 'Quiz Assessment must link to parent module.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:DocSectionShape',
    targetClass: 'robos:DocSection',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Documentation Section must have a title.' },
      { path: 'robos:sectionId', minCount: 1, message: 'Documentation Section must specify section identifier or anchor.' },
      { path: 'robos:docPage', minCount: 1, message: 'Documentation Section must link to parent documentation page.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ADROptionShape',
    targetClass: 'robos:ADROption',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'ADR Option must have a title.' },
      { path: 'robos:adr', minCount: 1, message: 'ADR Option must link to parent Architecture Decision Record.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ScenarioShape',
    targetClass: 'robos:Scenario',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Scenario must have a title.' },
      { path: 'robos:steps', minCount: 1, message: 'Scenario must define execution steps.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:ScenarioStepShape',
    targetClass: 'robos:ScenarioStep',
    properties: [
      { path: 'robos:keyword', minCount: 1, message: 'Scenario Step must specify keyword (Given, When, Then, And, But).' },
      { path: 'robos:stepText', minCount: 1, message: 'Scenario Step must specify step expression text.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:WebRouteShape',
    targetClass: 'robos:WebRoute',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Web Route must have a title.' },
      { path: 'robos:routePath', minCount: 1, message: 'Web Route must specify route path (e.g. /dashboard).' },
      { path: 'robos:app', minCount: 1, message: 'Web Route must link to parent application.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:CLICommandShape',
    targetClass: 'robos:CLICommand',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'CLI Command must have a title.' },
      { path: 'robos:commandName', minCount: 1, message: 'CLI Command must declare command name.' },
      { path: 'robos:app', minCount: 1, message: 'CLI Command must link to parent console application.' },
    ],
  },
  {
    shapeId: 'urn:robos:shape:CLIFlagShape',
    targetClass: 'robos:CLIFlag',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'CLI Flag must have a title.' },
      { path: 'robos:flagName', minCount: 1, message: 'CLI Flag must declare flag name (e.g. --output).' },
      { path: 'robos:command', minCount: 1, message: 'CLI Flag must link to parent CLI command.' },
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
